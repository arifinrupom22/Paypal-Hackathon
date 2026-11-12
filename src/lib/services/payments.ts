import "server-only";
import { createHash } from "node:crypto";
import { db } from "../db";
import { AppError } from "../errors";
import { appendAuditEvent, AUDIT } from "../audit";
import { createPayPalOrder, capturePayPalOrder, getPayPalOrder, paypalStatus } from "../paypal";
import { money } from "../money";
import { canReleaseReservation, verifyCapture } from "../payments/verification";

function appUrl(): string {
  return process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

function paypalRequestId(seed: string, operation: string): string {
  return createHash("sha256").update(`${seed}:${operation}`).digest("hex");
}

export interface CreatedOrder {
  transactionId: string;
  orderId: string;
  status: string;
  approveUrl: string | null;
  paypalEnvironment: string | null;
}

/**
 * Creates a PayPal order for a policy-approved transaction. PACT authorization
 * is re-checked against live database state before the PayPal order exists,
 * because a mandate can be revoked between policy evaluation and checkout.
 */
export async function createOrderForTransaction(input: {
  ownerId: string;
  transactionId: string;
  actorId: string;
  actorLabel: string;
}): Promise<CreatedOrder> {
  const reference = await resolveTransactionId(input.ownerId, input.transactionId);
  const outcome = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Transaction" WHERE id = ${reference} FOR UPDATE`;

    const transaction = await tx.transaction.findFirst({
      where: { id: reference, ownerId: input.ownerId },
      include: { mandate: true, proposal: true },
    });
    if (!transaction) throw new AppError("TRANSACTION_NOT_FOUND", "Transaction not found.", 404);
    if (transaction.paypalOrderId) {
      throw new AppError("ORDER_EXISTS", "A PayPal order already exists for this transaction.", 409, {
        paypalOrderId: transaction.paypalOrderId,
      });
    }
    if (transaction.status !== "POLICY_APPROVED") {
      throw new AppError(
        "TRANSACTION_NOT_PAYABLE",
        `Transaction is ${transaction.status} and cannot open a PayPal order.`,
        409,
      );
    }

    const agent = await tx.agent.findUnique({ where: { id: transaction.agentId } });
    const mandate = transaction.mandate;
    const mandateValid =
      mandate.status === "ACTIVE" &&
      !mandate.revokedAt &&
      mandate.expiresAt.getTime() > Date.now() &&
      agent?.status === "ACTIVE";

    if (!mandateValid) {
      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: "FAILED",
          failureCode: "MANDATE_INVALIDATED",
          failureMessage: "Mandate or agent became invalid before checkout.",
        },
      });
      await tx.proposal.update({
        where: { id: transaction.proposalId },
        data: { status: "BLOCKED" },
      });
      await appendAuditEvent(tx, {
        ownerId: input.ownerId,
        actorType: "USER",
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        action: AUDIT.PAYMENT_FAILED,
        resourceType: "TRANSACTION",
        resourceId: transaction.transactionId,
        summary: "Checkout refused: mandate is no longer valid.",
        details: { mandate_id: mandate.mandateId, reason: "MANDATE_INVALIDATED" },
      });
      return { invalidated: true as const, transactionId: transaction.transactionId };
    }

    const order = await createPayPalOrder({
      amount: money(transaction.amount).toFixed(2),
      currency: transaction.currency,
      description: transaction.proposal.description,
      referenceId: transaction.transactionId,
      customId: transaction.id,
      invoiceId: transaction.transactionId,
      returnUrl: `${appUrl()}/payments/return?transaction=${encodeURIComponent(transaction.transactionId)}`,
      cancelUrl: `${appUrl()}/payments?cancelled=${encodeURIComponent(transaction.transactionId)}`,
      requestId: paypalRequestId(transaction.idempotencyKey, "order"),
    });

    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        paypalOrderId: order.id,
        paypalStatus: order.status,
        status: "AWAITING_BUYER_APPROVAL",
      },
    });

    const orderAudit = await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: "USER",
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: AUDIT.PAYPAL_ORDER_CREATED,
      resourceType: "TRANSACTION",
      resourceId: transaction.transactionId,
      summary: `PayPal order ${order.id} created for buyer approval.`,
      details: {
        paypal_order_id: order.id,
        paypal_status: order.status,
        amount: money(transaction.amount).toFixed(2),
        currency: transaction.currency,
        mandate_id: mandate.mandateId,
      },
    });

    await tx.transaction.update({
      where: { id: transaction.id },
      data: { auditRefs: { push: orderAudit.eventId } },
    });

    return {
      invalidated: false as const,
      order: {
        transactionId: transaction.transactionId,
        orderId: order.id,
        status: order.status,
        approveUrl: order.approveUrl,
        paypalEnvironment: paypalStatus().environment,
      },
    };
  });

  if (outcome.invalidated) {
    throw new AppError(
      "MANDATE_INVALIDATED",
      "The mandate was revoked, suspended, or expired before checkout. The reservation has been released.",
      409,
    );
  }
  return outcome.order;
}

export interface CapturedPayment {
  transactionId: string;
  status: "SETTLED";
  captureId: string;
  capturedAmount: string;
  currency: string;
  paypalStatus: string;
}

export async function captureTransaction(input: {
  ownerId: string;
  transactionId: string;
  actorId: string;
  actorLabel: string;
}): Promise<CapturedPayment> {
  const reference = await resolveTransactionId(input.ownerId, input.transactionId);
  const locked = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Transaction" WHERE id = ${reference} FOR UPDATE`;
    const transaction = await tx.transaction.findFirst({
      where: { id: reference, ownerId: input.ownerId },
      include: { mandate: true, proposal: true },
    });
    if (!transaction) throw new AppError("TRANSACTION_NOT_FOUND", "Transaction not found.", 404);
    if (transaction.status === "SETTLED") {
      throw new AppError("ALREADY_CAPTURED", "This payment has already been captured.", 409);
    }
    if (!["AWAITING_BUYER_APPROVAL", "CAPTURING"].includes(transaction.status)) {
      throw new AppError(
        "TRANSACTION_NOT_CAPTURABLE",
        `Transaction is ${transaction.status} and cannot be captured.`,
        409,
      );
    }
    if (!transaction.paypalOrderId) {
      throw new AppError("ORDER_MISSING", "No PayPal order exists for this transaction.", 409);
    }
    if (transaction.failureCode === "CAPTURE_MISMATCH_RECONCILIATION_REQUIRED") {
      throw new AppError(
        "CAPTURE_RECONCILIATION_REQUIRED",
        "PayPal returned a capture that does not match the authorized amount or currency. The reservation is retained until reconciliation.",
        409,
      );
    }
    if (
      transaction.status === "CAPTURING" &&
      transaction.failureCode !== "CAPTURE_UNCONFIRMED" &&
      Date.now() - transaction.updatedAt.getTime() < 2 * 60_000
    ) {
      throw new AppError("CAPTURE_IN_PROGRESS", "A capture is already in progress.", 409);
    }
    if (transaction.status !== "CAPTURING") {
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: "CAPTURING", failureCode: null, failureMessage: null },
      });
    }
    return transaction;
  });

  let capture;
  try {
    capture = await capturePayPalOrder(
      locked.paypalOrderId!,
      paypalRequestId(locked.idempotencyKey, "capture"),
    );
  } catch (error) {
    await markCaptureUnconfirmed(input, locked.id, locked.transactionId, locked.paypalOrderId!, error);
    if (error instanceof AppError) throw error;
    throw new AppError(
      "CAPTURE_TRANSPORT_ERROR",
      "PayPal capture could not be confirmed. The transaction remains reserved; retry after checking PayPal.",
      502,
    );
  }

  const verification = verifyCapture(
    {
      orderStatus: capture.orderStatus,
      captureStatus: capture.captureStatus,
      captureId: capture.captureId,
      amount: capture.amount,
      currency: capture.currency,
    },
    { amount: locked.amount.toString(), currency: locked.currency },
  );
  const expected = money(locked.amount);

  if (!verification.orderCompleted || !verification.captureCompleted || !verification.captureIdPresent) {
    await failTransaction(input, locked.id, locked.transactionId, "CAPTURE_NOT_COMPLETED", {
      paypal_status: capture.orderStatus,
      capture_status: capture.captureStatus,
      captured_amount: capture.amount,
      captured_currency: capture.currency,
      expected_amount: expected.toFixed(2),
      expected_currency: locked.currency,
    });
    throw new AppError(
      "CAPTURE_NOT_COMPLETED",
      "PayPal did not report a completed capture. The reservation has been released.",
      409,
    );
  }

  if (!verification.amountMatches || !verification.currencyMatches) {
    await markCaptureMismatch(
      input,
      locked.id,
      locked.transactionId,
      capture.captureId!,
      capture.amount,
      capture.orderStatus,
      expected.toFixed(2),
      locked.currency,
    );
    throw new AppError(
      "CAPTURE_AMOUNT_MISMATCH",
      "PayPal captured a different amount or currency than PACT authorized. The reservation is retained and the transaction requires reconciliation.",
      409,
    );
  }

  const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Transaction" WHERE id = ${locked.id} FOR UPDATE`;
      const current = await tx.transaction.findUnique({ where: { id: locked.id } });
      if (current?.status === "SETTLED") return current;
      const updated = await tx.transaction.update({
        where: { id: locked.id },
        data: {
          status: "SETTLED",
          paypalStatus: capture.orderStatus,
          paypalCaptureId: capture.captureId,
          capturedAmount: expected.toFixed(2),
          paypalFeeAmount: capture.fee ? money(capture.fee).toFixed(2) : null,
          capturedAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
      });
      await tx.proposal.update({
        where: { id: locked.proposalId },
        data: { status: "COMPLETED" },
      });
      const captureAudit = await appendAuditEvent(tx, {
        ownerId: input.ownerId,
        actorType: "USER",
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        action: AUDIT.PAYMENT_CAPTURED,
        resourceType: "TRANSACTION",
        resourceId: locked.transactionId,
        summary: `PayPal capture ${capture.captureId} settled ${expected.toFixed(2)} ${locked.currency}.`,
        details: {
          paypal_order_id: locked.paypalOrderId,
          paypal_capture_id: capture.captureId,
          captured_amount: expected.toFixed(2),
          currency: locked.currency,
          paypal_fee: capture.fee,
          mandate_id: locked.mandate.mandateId,
        },
      });

      await tx.transaction.update({
        where: { id: locked.id },
        data: { auditRefs: { push: captureAudit.eventId } },
      });
      return updated;
    });

  return {
    transactionId: result.transactionId,
    status: "SETTLED",
    captureId: capture.captureId!,
    capturedAmount: expected.toFixed(2),
    currency: locked.currency,
    paypalStatus: capture.orderStatus,
  };
}

export interface ReconciledPayment {
  transactionId: string;
  status: string;
  message: string;
  captureId?: string | null;
}

/**
 * Resolves an order whose local state is ambiguous. It reads PayPal's order
 * evidence; it never treats an unconfirmed order as paid. A completed capture
 * must still match the authorized amount and currency.
 */
export async function reconcileTransaction(input: {
  ownerId: string;
  transactionId: string;
  actorId: string;
  actorLabel: string;
}): Promise<ReconciledPayment> {
  const reference = await resolveTransactionId(input.ownerId, input.transactionId);
  const transaction = await db.transaction.findFirst({
    where: { id: reference, ownerId: input.ownerId },
    include: { proposal: true },
  });
  if (!transaction) throw new AppError("TRANSACTION_NOT_FOUND", "Transaction not found.", 404);
  if (["SETTLED", "REFUNDED"].includes(transaction.status)) {
    return {
      transactionId: transaction.transactionId,
      status: transaction.status,
      message: "The transaction is already finalized.",
      captureId: transaction.paypalCaptureId,
    };
  }
  if (!transaction.paypalOrderId) {
    return {
      transactionId: transaction.transactionId,
      status: transaction.status,
      message:
        transaction.status === "POLICY_APPROVED"
          ? "No PayPal order exists. Release the reservation if checkout was abandoned."
          : "No PayPal order is associated with this transaction.",
    };
  }

  const order = await getPayPalOrder(transaction.paypalOrderId);
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];

  if (capture) {
    const verification = verifyCapture(
      {
        orderStatus: order.status,
        captureStatus: capture.status,
        captureId: capture.id,
        amount: capture.amount?.value ?? null,
        currency: capture.amount?.currency_code ?? null,
      },
      { amount: String(transaction.amount), currency: transaction.currency },
    );

    if (verification.settled) {
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM "Transaction" WHERE id = ${reference} FOR UPDATE`;
        const current = await tx.transaction.findFirst({ where: { id: reference, ownerId: input.ownerId } });
        if (!current || current.status === "SETTLED") return;
        await tx.transaction.update({
          where: { id: current.id },
          data: {
            status: "SETTLED",
            paypalStatus: order.status,
            paypalCaptureId: capture.id,
            capturedAmount: money(capture.amount!.value!).toFixed(2),
            paypalFeeAmount: capture.seller_receivable_breakdown?.paypal_fee?.value
              ? money(capture.seller_receivable_breakdown.paypal_fee.value).toFixed(2)
              : null,
            capturedAt: new Date(),
            failureCode: null,
            failureMessage: null,
          },
        });
        await tx.proposal.update({
          where: { id: current.proposalId },
          data: { status: "COMPLETED" },
        });
        const audit = await appendAuditEvent(tx, {
          ownerId: input.ownerId,
          actorType: "USER",
          actorId: input.actorId,
          actorLabel: input.actorLabel,
          action: AUDIT.PAYMENT_CAPTURED,
          resourceType: "TRANSACTION",
          resourceId: current.transactionId,
          summary: `Reconciled PayPal capture ${capture.id} settled ${capture.amount!.value} ${capture.amount!.currency_code}.`,
          details: {
            paypal_order_id: current.paypalOrderId,
            paypal_capture_id: capture.id,
            captured_amount: capture.amount!.value,
            currency: capture.amount!.currency_code,
            source: "reconciliation",
          },
        });
        await tx.transaction.update({
          where: { id: current.id },
          data: { auditRefs: { push: audit.eventId } },
        });
      });
      return {
        transactionId: transaction.transactionId,
        status: "SETTLED",
        message: "PayPal reported a completed, matching capture. Transaction settled.",
        captureId: capture.id,
      };
    }

    if (!verification.amountMatches || !verification.currencyMatches) {
      await markCaptureMismatch(
        input,
        transaction.id,
        transaction.transactionId,
        capture.id,
        capture.amount?.value ?? null,
        order.status,
        String(transaction.amount),
        transaction.currency,
      );
      throw new AppError(
        "CAPTURE_AMOUNT_MISMATCH",
        "PayPal captured a different amount or currency. The reservation remains held for reconciliation.",
        409,
      );
    }

    return {
      transactionId: transaction.transactionId,
      status: order.status,
      message: `PayPal capture is ${capture.status}; no settlement is recorded until it is COMPLETED.`,
      captureId: capture.id,
    };
  }

  if (order.status === "VOIDED" || order.status === "EXPIRED") {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Transaction" WHERE id = ${reference} FOR UPDATE`;
      const current = await tx.transaction.findFirst({ where: { id: reference, ownerId: input.ownerId } });
      if (!current || current.status === "SETTLED") return;
      await tx.transaction.update({
        where: { id: current.id },
        data: {
          status: "CANCELLED",
          paypalStatus: order.status,
          failureCode: "PAYPAL_ORDER_CLOSED",
          failureMessage: `PayPal order is ${order.status}; the reservation was released.`,
        },
      });
      const audit = await appendAuditEvent(tx, {
        ownerId: input.ownerId,
        actorType: "USER",
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        action: AUDIT.PAYMENT_CANCELLED,
        resourceType: "TRANSACTION",
        resourceId: current.transactionId,
        summary: `Reconciled a closed PayPal order (${order.status}); reserved budget released.`,
        details: { paypal_order_id: current.paypalOrderId, paypal_status: order.status },
      });
      await tx.transaction.update({
        where: { id: current.id },
        data: { auditRefs: { push: audit.eventId } },
      });
    });
    return {
      transactionId: transaction.transactionId,
      status: "CANCELLED",
      message: `PayPal order is ${order.status}; the reservation was released.`,
      captureId: null,
    };
  }

  return {
    transactionId: transaction.transactionId,
    status: order.status,
    message: `PayPal order is ${order.status}; no completed capture was found.`,
    captureId: null,
  };
}

async function resolveTransactionId(ownerId: string, reference: string): Promise<string> {
  const transaction = await db.transaction.findFirst({
    where: { ownerId, OR: [{ id: reference }, { transactionId: reference }] },
    select: { id: true },
  });
  if (!transaction) throw new AppError("TRANSACTION_NOT_FOUND", "Transaction not found.", 404);
  return transaction.id;
}

async function markCaptureUnconfirmed(
  input: { ownerId: string; actorId: string; actorLabel: string },
  id: string,
  transactionId: string,
  paypalOrderId: string,
  cause: unknown,
) {
  const causeCode = cause instanceof AppError ? cause.code : "CAPTURE_TRANSPORT_ERROR";
  const causeMessage = cause instanceof Error ? cause.message : "PayPal response was not received.";
  await db.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id },
      data: {
        status: "CAPTURING",
        failureCode: "CAPTURE_UNCONFIRMED",
        failureMessage:
          "PayPal capture could not be confirmed. The reservation is retained; retry capture or reconcile with PayPal.",
      },
    });
    const audit = await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: "USER",
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: AUDIT.PAYMENT_FAILED,
      resourceType: "TRANSACTION",
      resourceId: transactionId,
      summary: "PayPal capture was not confirmed; the reservation was retained.",
      details: {
        paypal_order_id: paypalOrderId,
        cause_code: causeCode,
        cause_message: causeMessage,
        reservation_retained: true,
      },
    });
    await tx.transaction.update({
      where: { id },
      data: { auditRefs: { push: audit.eventId } },
    });
  });
}

async function markCaptureMismatch(
  input: { ownerId: string; actorId: string; actorLabel: string },
  id: string,
  transactionId: string,
  captureId: string,
  capturedAmount: string | null,
  paypalStatus: string,
  expectedAmount: string,
  expectedCurrency: string,
) {
  await db.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id },
      data: {
        status: "CAPTURING",
        paypalStatus,
        paypalCaptureId: captureId,
        capturedAmount: capturedAmount ? money(capturedAmount).toFixed(2) : null,
        failureCode: "CAPTURE_MISMATCH_RECONCILIATION_REQUIRED",
        failureMessage:
          "PayPal captured an amount or currency different from the PACT authorization. The reservation is retained until reconciliation.",
      },
    });
    const audit = await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: "USER",
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: AUDIT.PAYMENT_FAILED,
      resourceType: "TRANSACTION",
      resourceId: transactionId,
      summary: "PayPal capture amount or currency mismatch; reconciliation required.",
      details: {
        paypal_capture_id: captureId,
        captured_amount: capturedAmount,
        expected_amount: expectedAmount,
        expected_currency: expectedCurrency,
        reservation_retained: true,
      },
    });
    await tx.transaction.update({
      where: { id },
      data: { auditRefs: { push: audit.eventId } },
    });
  });
}

async function failTransaction(
  input: { ownerId: string; actorId: string; actorLabel: string },
  id: string,
  transactionId: string,
  code: string,
  details: Record<string, unknown>,
) {
  await db.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id },
      data: {
        status: "FAILED",
        failureCode: code,
        failureMessage: "PayPal capture did not complete; the reserved budget was released.",
      },
    });
    const failAudit = await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: "USER",
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: AUDIT.PAYMENT_FAILED,
      resourceType: "TRANSACTION",
      resourceId: transactionId,
      summary: `Payment capture failed (${code}); reserved budget released.`,
      details,
    });
    await tx.transaction.update({
      where: { id },
      data: { auditRefs: { push: failAudit.eventId } },
    });
  });
}

export async function cancelTransaction(input: {
  ownerId: string;
  transactionId: string;
  actorId: string;
  actorLabel: string;
}) {
  const reference = await resolveTransactionId(input.ownerId, input.transactionId);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Transaction" WHERE id = ${reference} FOR UPDATE`;
    const transaction = await tx.transaction.findFirst({
      where: { id: reference, ownerId: input.ownerId },
    });
    if (!transaction) throw new AppError("TRANSACTION_NOT_FOUND", "Transaction not found.", 404);
    if (!canReleaseReservation(transaction.status, transaction.paypalOrderId)) {
      throw new AppError(
        "RESERVATION_NOT_RELEASABLE",
        transaction.paypalOrderId
          ? "A PayPal order exists, so the local reservation cannot be released without reconciliation. Complete or reconcile the PayPal order first."
          : `Transaction is ${transaction.status} and cannot be cancelled.`,
        409,
      );
    }
    const updated = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: "CANCELLED",
        failureCode: "BUYER_CANCELLED",
        failureMessage: "Buyer cancelled before settlement.",
      },
    });
    const cancelAudit = await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: "USER",
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: AUDIT.PAYMENT_CANCELLED,
      resourceType: "TRANSACTION",
      resourceId: transaction.transactionId,
      summary: "Buyer cancelled the checkout; reserved budget released.",
      details: { amount: String(transaction.amount), currency: transaction.currency },
    });
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { auditRefs: { push: cancelAudit.eventId } },
    });
    return updated;
  });
}
