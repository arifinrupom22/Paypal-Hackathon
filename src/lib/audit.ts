import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";
import { canonicalize, sha256Hex } from "./crypto/canonical";
import { signPayload, verifySignature, platformKeys } from "./crypto/keys";
import { newId } from "./ids";

type DbClient = Prisma.TransactionClient | PrismaClient;

export const AUDIT = {
  ACCOUNT_CREATED: "ACCOUNT_CREATED",
  SESSION_STARTED: "SESSION_STARTED",
  SESSION_ENDED: "SESSION_ENDED",
  AGENT_REGISTERED: "AGENT_REGISTERED",
  AGENT_SUSPENDED: "AGENT_SUSPENDED",
  AGENT_RESUMED: "AGENT_RESUMED",
  MANDATE_CREATED: "MANDATE_CREATED",
  MANDATE_SIGNED: "MANDATE_SIGNED",
  MANDATE_REVOKED: "MANDATE_REVOKED",
  MANDATE_DELEGATED: "MANDATE_DELEGATED",
  MANDATE_PROOF_VERIFIED: "MANDATE_PROOF_VERIFIED",
  PROPOSAL_CREATED: "PROPOSAL_CREATED",
  POLICY_EVALUATED: "POLICY_EVALUATED",
  POLICY_BLOCKED: "POLICY_BLOCKED",
  POLICY_APPROVAL_REQUIRED: "POLICY_APPROVAL_REQUIRED",
  APPROVAL_GRANTED: "APPROVAL_GRANTED",
  APPROVAL_REJECTED: "APPROVAL_REJECTED",
  PAYPAL_ORDER_CREATED: "PAYPAL_ORDER_CREATED",
  PAYMENT_CAPTURED: "PAYMENT_CAPTURED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PAYMENT_CANCELLED: "PAYMENT_CANCELLED",
  WEBHOOK_RECEIVED: "WEBHOOK_RECEIVED",
  SECURITY_TEST_EXECUTED: "SECURITY_TEST_EXECUTED",
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];

export interface AuditInput {
  ownerId: string;
  actorType: "USER" | "AGENT" | "SYSTEM";
  actorId?: string | null;
  actorLabel: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
}

/**
 * Appends an audit record to a per-owner hash chain. The chain link is computed
 * under a row lock on the owner so concurrent writers cannot fork it, and each
 * record is signed with the platform Ed25519 key.
 */
export async function appendAuditEvent(client: DbClient, input: AuditInput) {
  // Serialize chain appends per owner with a transaction-scoped advisory lock.
  // Unlike a row lock on User, this cannot deadlock against mandate or
  // transaction row locks held by concurrent authorization transactions.
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.ownerId}))`;

  const previous = await client.auditEvent.findFirst({
    where: { ownerId: input.ownerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { hash: true },
  });

  const eventId = newId("audit");
  const createdAt = new Date();
  const body = {
    event_id: eventId,
    owner_id: input.ownerId,
    actor: { id: input.actorId ?? null, label: input.actorLabel, type: input.actorType },
    action: input.action,
    resource: { id: input.resourceId ?? null, type: input.resourceType },
    summary: input.summary,
    details: input.details ?? {},
    created_at: createdAt.toISOString(),
  };
  const prevHash = previous?.hash ?? null;
  const hash = sha256Hex(`${prevHash ?? "GENESIS"}:${canonicalize(body)}`);
  const { signature } = signPayload({ hash });

  return client.auditEvent.create({
    data: {
      eventId,
      ownerId: input.ownerId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      summary: input.summary,
      details: (input.details ?? {}) as Prisma.InputJsonValue,
      hash,
      prevHash,
      signature,
      createdAt,
    },
  });
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  brokenAt: string | null;
  signatureFailures: string[];
}

/** Recomputes the hash chain and verifies every Ed25519 record signature. */
export async function verifyAuditChain(ownerId: string): Promise<ChainVerification> {
  const records = await db.auditEvent.findMany({
    where: { ownerId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const { publicKeyBase64 } = platformKeys();
  let prevHash: string | null = null;
  const signatureFailures: string[] = [];
  let brokenAt: string | null = null;

  for (const record of records) {
    const body = {
      event_id: record.eventId,
      owner_id: record.ownerId,
      actor: { id: record.actorId, label: record.actorLabel, type: record.actorType },
      action: record.action,
      resource: { id: record.resourceId, type: record.resourceType },
      summary: record.summary,
      details: record.details,
      created_at: record.createdAt.toISOString(),
    };
    const expectedHash = sha256Hex(`${prevHash ?? "GENESIS"}:${canonicalize(body)}`);
    if (!brokenAt && (record.prevHash !== prevHash || expectedHash !== record.hash)) {
      brokenAt = record.eventId;
    }
    if (!verifySignature({ hash: record.hash }, record.signature, publicKeyBase64)) {
      signatureFailures.push(record.eventId);
    }
    prevHash = record.hash;
  }

  return {
    valid: brokenAt === null && signatureFailures.length === 0,
    checked: records.length,
    brokenAt,
    signatureFailures,
  };
}
