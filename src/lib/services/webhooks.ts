import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { appendAuditEvent, AUDIT } from "../audit";
import { verifyPayPalWebhookSignature } from "../paypal";
import { money } from "../money";
import { isDuplicateKeyError, verifyCapture } from "../payments/verification";

interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource_type?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: { value?: string; currency_code?: string };
    supplementary_data?: { related_ids?: { order_id?: string } };
    seller_payable_breakdown?: { total_refunded_amount?: { value?: string } };
  };
}

interface WebhookResult {
  status: "processed" | "duplicate" | "rejected";
  eventId: string;
  transactionId?: string;
  reason?: string;
}

async function recordRejected(
  event: PayPalWebhookEvent,
  reason: string,
  error?: unknown,
): Promise<void> {
  try {
    await db.webhookEvent.create({
      data: {
        eventId: event.id,
        eventType: event.event_type,
        resourceId: event.resource?.id ?? null,
        resourceType: event.resource_type ?? null,
        status: "REJECTED",
        signatureVerified: false,
        payload: event as unknown as Prisma.InputJsonValue,
        error: reason,
      },
    });
  } catch (caught) {
    if (isDuplicateKeyError(caught)) return;
    throw error ?? caught;
  }
}

/**
 * Verifies the PayPal transmission signature before reading business state,
 * deduplicates by PayPal event id at the database constraint, and never treats
 * an order as settled without a completed capture matching PACT's amount and
 * currency. Rejected events are persisted but cannot mutate transactions.
 */
export async function processPayPalWebhook(
  headers: Headers,
  rawBody: string,
): Promise<WebhookResult> {
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent;
  } catch {
    return { status: "rejected", eventId: "unknown", reason: "Malformed JSON." };
  }
  if (!event?.id || !event?.event_type) {
    return { status: "rejected", eventId: "unknown", reason: "Missing event id or type." };
  }

  let verification: { verified: boolean; reason?: string };
  try {
    verification = await verifyPayPalWebhookSignature(headers, event);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification unavailable.";
    await recordRejected(event, message);
    return { status: "rejected", eventId: event.id, reason: message };
  }

  if (!verification.verified) {
    const reason = verification.reason ?? "Signature verification failed.";
    await recordRejected(event, reason);
    return { status: "rejected", eventId: event.id, reason };
  }

  const existing = await db.webhookEvent.findUnique({ where: { eventId: event.id } });
  if (existing && existing.status !== "REJECTED") {
    await db.webhookEvent.update({
      where: { id: existing.id },
      data: { attempts: { increment: 1 } },
    });
    return { status: "duplicate", eventId: event.id };
  }

  const captureId = event.resource?.id ?? null;
  const orderId = event.resource?.supplementary_data?.related_ids?.order_id ?? null;

  const transaction = await db.transaction.findFirst({
    where: {
      OR: [
        orderId ? { paypalOrderId: orderId } : { id: "__none__" },
        captureId ? { paypalCaptureId: captureId } : { id: "__none__" },
      ],
    },
  });

  let mismatch: string | null = null;
  if (transaction && event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const verificationResult = verifyCapture(
      {
        orderStatus: "COMPLETED",
        captureStatus: event.resource?.status ?? null,
        captureId,
        amount: event.resource?.amount?.value ?? null,
        currency: event.resource?.amount?.currency_code ?? null,
      },
      { amount: String(transaction.amount), currency: transaction.currency },
    );
    if (!verificationResult.settled) {
      mismatch =
        "Webhook capture amount, currency or capture status did not match the PACT authorization.";
    }
  }

  let webhookRow;
  try {
    if (existing) {
      // A previous verification failure must not permanently block a later,
      // genuinely signed delivery of the same PayPal event.
      const claimed = await db.webhookEvent.updateMany({
        where: { id: existing.id, status: "REJECTED" },
        data: {
          eventType: event.event_type,
          resourceId: captureId,
          resourceType: event.resource_type ?? null,
          ownerId: transaction?.ownerId ?? existing.ownerId,
          status: mismatch ? "FAILED" : "PROCESSED",
          signatureVerified: true,
          payload: event as unknown as Prisma.InputJsonValue,
          error: mismatch,
          processedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
      if (claimed.count === 0) {
        return { status: "duplicate", eventId: event.id };
      }
      webhookRow = await db.webhookEvent.findUniqueOrThrow({ where: { id: existing.id } });
    } else {
      webhookRow = await db.webhookEvent.create({
        data: {
          eventId: event.id,
          eventType: event.event_type,
          resourceId: captureId,
          resourceType: event.resource_type ?? null,
          ownerId: transaction?.ownerId ?? null,
          status: mismatch ? "FAILED" : "PROCESSED",
          signatureVerified: true,
          payload: event as unknown as Prisma.InputJsonValue,
          error: mismatch,
          processedAt: new Date(),
        },
      });
    }
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      await db.webhookEvent.updateMany({
        where: { eventId: event.id },
        data: { attempts: { increment: 1 } },
      });
      return { status: "duplicate", eventId: event.id };
    }
    throw error;
  }

  if (!transaction) {
    return { status: "processed", eventId: event.id };
  }

  if (mismatch) {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Transaction" WHERE id = ${transaction.id} FOR UPDATE`;
      const current = await tx.transaction.findUnique({ where: { id: transaction.id } });
      if (!current) return;
      if (current.status !== "SETTLED") {
        await tx.transaction.update({
          where: { id: current.id },
          data: {
            status: "CAPTURING",
            paypalStatus: event.resource?.status ?? current.paypalStatus,
            paypalCaptureId: captureId ?? current.paypalCaptureId,
            capturedAmount: event.resource?.amount?.value
              ? money(event.resource.amount.value).toFixed(2)
              : null,
            failureCode: "WEBHOOK_CAPTURE_MISMATCH",
            failureMessage:
              "PayPal reported a capture that does not match the authorized amount or currency. The reservation is retained for reconciliation.",
          },
        });
      }
      const audit = await appendAuditEvent(tx, {
        ownerId: transaction.ownerId,
        actorType: "SYSTEM",
        actorId: "paypal-webhook",
        actorLabel: "PayPal webhook",
        action: AUDIT.PAYMENT_FAILED,
        resourceType: "TRANSACTION",
        resourceId: transaction.transactionId,
        summary: "PayPal webhook capture evidence did not match the authorization; reconciliation required.",
        details: {
          event_id: event.id,
          event_type: event.event_type,
          paypal_order_id: orderId,
          paypal_capture_id: captureId,
          captured_amount: event.resource?.amount?.value ?? null,
          captured_currency: event.resource?.amount?.currency_code ?? null,
          expected_amount: String(transaction.amount),
          expected_currency: transaction.currency,
          reservation_retained: true,
        },
      });
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { auditRefs: { push: audit.eventId } },
      });
    });
    return {
      status: "processed",
      eventId: event.id,
      transactionId: transaction.transactionId,
      reason: mismatch,
    };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Transaction" WHERE id = ${transaction.id} FOR UPDATE`;
    const current = await tx.transaction.findUnique({ where: { id: transaction.id } });
    if (!current) return;

    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      if (current.status !== "SETTLED") {
        await tx.transaction.update({
          where: { id: current.id },
          data: {
            status: "SETTLED",
            paypalStatus: "COMPLETED",
            paypalCaptureId: captureId ?? current.paypalCaptureId,
            capturedAmount: event.resource?.amount?.value
              ? money(event.resource.amount.value).toFixed(2)
              : null,
            capturedAt: now,
            failureCode: null,
            failureMessage: null,
          },
        });
        await tx.proposal.update({
          where: { id: current.proposalId },
          data: { status: "COMPLETED" },
        });
      }
    } else if (event.event_type === "PAYMENT.CAPTURE.DENIED") {
      if (current.status !== "SETTLED") {
        await tx.transaction.update({
          where: { id: current.id },
          data: {
            status: "FAILED",
            paypalStatus: "DENIED",
            failureCode: "PAYPAL_CAPTURE_DENIED",
            failureMessage: "PayPal reported the capture as denied; reserved budget released.",
          },
        });
      }
    } else if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      await tx.transaction.update({
        where: { id: current.id },
        data: {
          status: "REFUNDED",
          paypalStatus: "REFUNDED",
          refundedAt: now,
        },
      });
    }

    const audit = await appendAuditEvent(tx, {
      ownerId: transaction.ownerId,
      actorType: "SYSTEM",
      actorId: "paypal-webhook",
      actorLabel: "PayPal webhook",
      action: AUDIT.WEBHOOK_RECEIVED,
      resourceType: "WEBHOOK_EVENT",
      resourceId: webhookRow.eventId,
      summary: `PayPal ${event.event_type} processed for ${transaction.transactionId}.`,
      details: {
        event_id: event.id,
        event_type: event.event_type,
        paypal_order_id: orderId,
        paypal_capture_id: captureId,
        signature_verified: true,
        captured_amount: event.resource?.amount?.value ?? null,
        captured_currency: event.resource?.amount?.currency_code ?? null,
      },
    });
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { auditRefs: { push: audit.eventId } },
    });
  });

  return { status: "processed", eventId: event.id, transactionId: transaction.transactionId };
}
