import "server-only";
import type { Agent, Mandate, MandateScope, Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { newId, newNonce } from "../ids";
import { formatMoney, money, normalizeCategory, normalizeDomain, normalizeMerchant } from "../money";
import { buildMandatePayload } from "../crypto/mandate-payload";
import { signPayload, verifySignature, platformKeys } from "../crypto/keys";
import { appendAuditEvent, AUDIT } from "../audit";
import { ACTIVE_TRANSACTION_STATUSES } from "../domain/constants";

export type MandateWithScopes = Mandate & { scopes: MandateScope[]; agent?: Agent | null };

type MandateClient = Prisma.TransactionClient | typeof db;

async function loadActiveChildCommitments(client: MandateClient, parentId: string) {
  const rows = await client.mandate.findMany({
    where: {
      parentMandateId: parentId,
      status: "ACTIVE",
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { maxTotal: true, maxTransactions: true },
  });
  return rows.reduce(
    (total, row) => ({
      amount: total.amount.plus(money(row.maxTotal)),
      transactions: total.transactions + row.maxTransactions,
    }),
    { amount: money(0), transactions: 0 },
  );
}

export interface MandateSpend {
  spent: string;
  activeCount: number;
}

export async function loadSpendByMandateIds(mandateIds: string[]): Promise<Map<string, MandateSpend>> {
  if (mandateIds.length === 0) return new Map();
  const grouped = await db.transaction.groupBy({
    by: ["mandateId"],
    where: { mandateId: { in: mandateIds }, status: { in: ACTIVE_TRANSACTION_STATUSES } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return new Map(
    grouped.map((row) => [
      row.mandateId,
      {
        spent: formatMoney(row._sum.amount ?? 0),
        activeCount: row._count._all,
      },
    ]),
  );
}

export async function loadSpendForMandate(mandateId: string): Promise<MandateSpend> {
  const map = await loadSpendByMandateIds([mandateId]);
  return map.get(mandateId) ?? { spent: "0.00", activeCount: 0 };
}

export function mandatePayloadOf(mandate: MandateWithScopes) {
  return {
    mandateId: mandate.mandateId,
    ownerId: mandate.ownerId,
    agentId: mandate.agentId,
    rootAgentId: mandate.rootAgentId,
    parentMandateId: mandate.parentMandateId,
    currency: mandate.currency,
    maxTotal: formatMoney(mandate.maxTotal),
    maxPerTransaction: formatMoney(mandate.maxPerTransaction),
    approvalThreshold:
      mandate.approvalThreshold === null ? null : formatMoney(mandate.approvalThreshold),
    maxTransactions: mandate.maxTransactions,
    expiresAt: mandate.expiresAt,
    delegationAllowed: mandate.delegationAllowed,
    scopes: mandate.scopes.map((scope) => ({
      type: scope.type as "MERCHANT" | "CATEGORY",
      normalizedValue: scope.normalizedValue,
    })),
    nonce: mandate.nonce,
    issuedAt: mandate.issuedAt,
  };
}

export function verifyMandateProof(mandate: MandateWithScopes): {
  valid: boolean;
  signatureValid: boolean;
  hashValid: boolean;
  keyMatches: boolean;
} {
  const { publicKeyBase64, keyId } = platformKeys();
  const payload = buildMandatePayload(mandatePayloadOf(mandate));
  const signatureValid = verifySignature(payload, mandate.signature, publicKeyBase64);
  const { canonicalHash } = signPayload(payload);
  return {
    valid: signatureValid && canonicalHash === mandate.canonicalHash && keyId === mandate.signingKeyId,
    signatureValid,
    hashValid: canonicalHash === mandate.canonicalHash,
    keyMatches: keyId === mandate.signingKeyId,
  };
}

export interface CreateMandateInput {
  ownerId: string;
  createdById: string;
  actorLabel: string;
  actorType?: "USER" | "AGENT";
  agentId: string;
  title: string;
  description?: string;
  currency: string;
  maxTotal: string;
  maxPerTransaction: string;
  approvalThreshold?: string | null;
  maxTransactions: number;
  expiresAt: Date;
  delegationAllowed: boolean;
  merchants: string[];
  categories: string[];
  parentMandateId?: string | null;
}

export async function createMandate(input: CreateMandateInput) {
  const agent = await db.agent.findFirst({ where: { id: input.agentId, ownerId: input.ownerId } });
  if (!agent) throw new AppError("AGENT_NOT_FOUND", "Agent not found.", 404);
  if (agent.status !== "ACTIVE") {
    throw new AppError("AGENT_INACTIVE", "Only active agents can receive mandates.", 409);
  }

  const maxTotal = money(input.maxTotal);
  const maxPerTx = money(input.maxPerTransaction);
  if (maxPerTx.greaterThan(maxTotal)) {
    throw new AppError("LIMIT_INVALID", "Per-transaction ceiling cannot exceed the total ceiling.", 422);
  }
  if (input.approvalThreshold && money(input.approvalThreshold).greaterThan(maxPerTx)) {
    throw new AppError("LIMIT_INVALID", "Step-up threshold cannot exceed the per-transaction ceiling.", 422);
  }
  if (input.expiresAt.getTime() <= Date.now()) {
    throw new AppError("EXPIRY_INVALID", "Mandate expiry must be in the future.", 422);
  }

  const merchants = Array.from(
    new Set(input.merchants.map((value) => normalizeMerchant(value)).filter(Boolean)),
  ).sort();
  const categories = Array.from(
    new Set(input.categories.map((value) => normalizeCategory(value)).filter(Boolean)),
  ).sort();
  if (merchants.length === 0 || categories.length === 0) {
    throw new AppError("SCOPE_REQUIRED", "A mandate needs at least one merchant and one category.", 422);
  }

  let parent: (Mandate & { scopes: MandateScope[] }) | null = null;
  let effectiveApprovalThreshold = input.approvalThreshold
    ? money(input.approvalThreshold)
    : null;
  if (input.parentMandateId) {
    parent = await db.mandate.findFirst({
      where: { id: input.parentMandateId, ownerId: input.ownerId },
      include: { scopes: true },
    });
    if (!parent) throw new AppError("PARENT_NOT_FOUND", "Parent mandate not found.", 404);
    if (parent.status !== "ACTIVE" || parent.revokedAt) {
      throw new AppError("PARENT_INACTIVE", "Parent mandate is not active.", 409);
    }
    if (parent.expiresAt.getTime() <= Date.now()) {
      throw new AppError("PARENT_EXPIRED", "Parent mandate has expired.", 409);
    }
    if (!parent.delegationAllowed) {
      throw new AppError("DELEGATION_NOT_ALLOWED", "Parent mandate does not allow delegation.", 409);
    }
    if (parent.currency !== input.currency) {
      throw new AppError("CURRENCY_MISMATCH", "Delegated mandates must use the parent currency.", 422);
    }
    if (maxPerTx.greaterThan(money(parent.maxPerTransaction))) {
      throw new AppError(
        "DELEGATION_PER_TRANSACTION",
        "Delegated per-transaction ceiling exceeds the parent's ceiling.",
        409,
      );
    }
    if (parent.approvalThreshold) {
      const parentThreshold = money(parent.approvalThreshold);
      if (!effectiveApprovalThreshold || effectiveApprovalThreshold.greaterThan(parentThreshold)) {
        // A child may be stricter than its parent, never looser.
        effectiveApprovalThreshold = parentThreshold;
      }
    }
    const parentSpend = await loadSpendForMandate(parent.id);
    const childCommitments = await loadActiveChildCommitments(db, parent.id);
    const parentRemaining = money(parent.maxTotal).minus(
      money(parentSpend.spent).plus(childCommitments.amount),
    );
    if (maxTotal.greaterThan(parentRemaining)) {
      throw new AppError(
        "DELEGATION_BUDGET",
        `Child ceiling exceeds the parent's remaining authority of ${formatMoney(parentRemaining)} ${parent.currency}.`,
        409,
      );
    }
    if (parentSpend.activeCount + childCommitments.transactions + input.maxTransactions > parent.maxTransactions) {
      throw new AppError(
        "DELEGATION_TRANSACTION_COUNT",
        "Child transaction ceiling exceeds the parent's remaining transaction capacity.",
        409,
      );
    }
    if (input.expiresAt.getTime() > parent.expiresAt.getTime()) {
      throw new AppError("DELEGATION_EXPIRY", "Child expiry cannot exceed the parent's expiry.", 409);
    }
    const parentScopes = new Set(
      parent.scopes.map((scope) => `${scope.type}:${scope.normalizedValue}`),
    );
    const outOfScope = [
      ...merchants.map((value) => `MERCHANT:${value}`),
      ...categories.map((value) => `CATEGORY:${value}`),
    ].filter((scope) => !parentScopes.has(scope));
    if (outOfScope.length > 0) {
      throw new AppError(
        "DELEGATION_SCOPE",
        `Delegated permissions must be a subset of the parent: ${outOfScope.join(", ")}`,
        409,
      );
    }
    const parentAgent = await db.agent.findUnique({ where: { id: parent.agentId } });
    let cursor = agent;
    let lineageOk = false;
    for (let depth = 0; depth < 12 && cursor; depth += 1) {
      if (cursor.id === parentAgent?.id) {
        lineageOk = true;
        break;
      }
      cursor = cursor.parentAgentId
        ? ((await db.agent.findUnique({ where: { id: cursor.parentAgentId } })) as Agent)
        : (null as unknown as Agent);
    }
    if (!lineageOk) {
      throw new AppError(
        "DELEGATION_LINEAGE",
        "The delegated agent must descend from the parent mandate's agent.",
        409,
      );
    }
  }

  const mandateId = newId("mandate");
  const nonce = newNonce();
  const issuedAt = new Date();
  const scopes = [
    ...merchants.map((value) => ({ type: "MERCHANT" as const, value, normalizedValue: value })),
    ...categories.map((value) => ({ type: "CATEGORY" as const, value, normalizedValue: value })),
  ];

  const payload = buildMandatePayload({
    mandateId,
    ownerId: input.ownerId,
    agentId: agent.id,
    rootAgentId: agent.tier === "ROOT" ? agent.id : (parent?.rootAgentId ?? agent.id),
    parentMandateId: parent?.id ?? null,
    currency: input.currency,
    maxTotal: formatMoney(maxTotal),
    maxPerTransaction: formatMoney(maxPerTx),
    approvalThreshold: effectiveApprovalThreshold ? formatMoney(effectiveApprovalThreshold) : null,
    maxTransactions: input.maxTransactions,
    expiresAt: input.expiresAt,
    delegationAllowed: input.delegationAllowed,
    scopes,
    nonce,
    issuedAt,
  });
  const { signature, canonicalHash, keyId } = signPayload(payload);

  const mandate = await db.$transaction(async (tx) => {
    if (parent) {
      // Serialize sibling delegation so two concurrent child mandates cannot
      // reserve the same parent capacity.
      await tx.$executeRaw`SELECT id FROM "Mandate" WHERE id = ${parent.id} FOR UPDATE`;
      const freshParent = await tx.mandate.findUnique({
        where: { id: parent.id },
        include: { scopes: true },
      });
      if (
        !freshParent ||
        freshParent.status !== "ACTIVE" ||
        freshParent.revokedAt ||
        freshParent.expiresAt.getTime() <= Date.now()
      ) {
        throw new AppError("PARENT_INACTIVE", "Parent mandate is no longer active.", 409);
      }
      const parentTransactions = await tx.transaction.aggregate({
        where: { mandateId: freshParent.id, status: { in: ACTIVE_TRANSACTION_STATUSES } },
        _sum: { amount: true },
        _count: { _all: true },
      });
      const childCommitments = await loadActiveChildCommitments(tx, freshParent.id);
      const committed = money(parentTransactions._sum.amount ?? 0).plus(childCommitments.amount);
      if (maxTotal.plus(committed).greaterThan(money(freshParent.maxTotal))) {
        throw new AppError(
          "DELEGATION_BUDGET",
          "Delegated ceiling exceeds the parent's remaining uncommitted authority.",
          409,
        );
      }
      const committedTransactions =
        (parentTransactions._count._all ?? 0) + childCommitments.transactions;
      if (input.maxTransactions + committedTransactions > freshParent.maxTransactions) {
        throw new AppError(
          "DELEGATION_TRANSACTION_COUNT",
          "Child transaction ceiling exceeds the parent's remaining transaction capacity.",
          409,
        );
      }
    }
    const created = await tx.mandate.create({
      data: {
        mandateId,
        ownerId: input.ownerId,
        agentId: agent.id,
        rootAgentId: agent.tier === "ROOT" ? agent.id : (parent?.rootAgentId ?? agent.id),
        parentMandateId: parent?.id ?? null,
        createdById: input.createdById,
        title: input.title,
        description: input.description || null,
        currency: input.currency,
        maxTotal: maxTotal.toFixed(2),
        maxPerTransaction: maxPerTx.toFixed(2),
        approvalThreshold: effectiveApprovalThreshold ? effectiveApprovalThreshold.toFixed(2) : null,
        maxTransactions: input.maxTransactions,
        expiresAt: input.expiresAt,
        delegationAllowed: input.delegationAllowed,
        status: "ACTIVE",
        signature,
        signingKeyId: keyId,
        canonicalHash,
        nonce,
        issuedAt,
        scopes: { create: scopes.map((scope) => ({ ...scope })) },
      },
      include: { scopes: true },
    });

    await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: input.actorType ?? "USER",
      actorId: input.createdById,
      actorLabel: input.actorLabel,
      action: AUDIT.MANDATE_CREATED,
      resourceType: "MANDATE",
      resourceId: mandateId,
      summary: `Mandate ${mandateId} created for agent ${agent.name}.`,
      details: {
        currency: input.currency,
        max_total: formatMoney(maxTotal),
        max_per_transaction: formatMoney(maxPerTx),
        max_transactions: input.maxTransactions,
        expires_at: input.expiresAt.toISOString(),
        merchants,
        categories,
        parent_mandate: parent?.mandateId ?? null,
      },
    });

    await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: "SYSTEM",
      actorId: keyId,
      actorLabel: "PACT Ed25519 signer",
      action: AUDIT.MANDATE_SIGNED,
      resourceType: "MANDATE",
      resourceId: mandateId,
      summary: `Mandate ${mandateId} signed with ${keyId}.`,
      details: { canonical_hash: canonicalHash, signature_algorithm: "Ed25519" },
    });

    if (parent) {
      await appendAuditEvent(tx, {
        ownerId: input.ownerId,
        actorType: "USER",
        actorId: input.createdById,
        actorLabel: input.actorLabel,
        action: AUDIT.MANDATE_DELEGATED,
        resourceType: "MANDATE",
        resourceId: mandateId,
        summary: `Authority delegated from ${parent.mandateId} to ${agent.name}.`,
        details: {
          parent_mandate: parent.mandateId,
          child_ceiling: formatMoney(maxTotal),
          delegated_expiry: input.expiresAt.toISOString(),
        },
      });
    }

    return created;
  });

  return { mandate, agent, parent };
}

export interface RevokeResult {
  revoked: string[];
}

export async function revokeMandate(input: {
  ownerId: string;
  mandateId: string;
  actorId: string;
  actorLabel: string;
  reason?: string;
}): Promise<RevokeResult> {
  const mandate = await db.mandate.findFirst({
    where: { id: input.mandateId, ownerId: input.ownerId },
    include: { childMandates: { select: { id: true, mandateId: true } } },
  });
  if (!mandate) throw new AppError("MANDATE_NOT_FOUND", "Mandate not found.", 404);
  if (mandate.status === "REVOKED") throw new AppError("ALREADY_REVOKED", "Mandate is already revoked.", 409);

  const descendants: string[] = [];
  const collect = async (mandateId: string) => {
    const children = await db.mandate.findMany({
      where: { parentMandateId: mandateId, status: { not: "REVOKED" } },
      select: { id: true, mandateId: true },
    });
    for (const child of children) {
      descendants.push(child.id);
      await collect(child.id);
    }
  };
  await collect(mandate.id);

  const revoked = await db.$transaction(async (tx) => {
    const now = new Date();
    await tx.mandate.update({
      where: { id: mandate.id },
      data: {
        status: "REVOKED",
        revokedAt: now,
        revokedById: input.actorId,
        revocationReason: input.reason || "Revoked by owner",
      },
    });
    if (descendants.length > 0) {
      await tx.mandate.updateMany({
        where: { id: { in: descendants } },
        data: {
          status: "REVOKED",
          revokedAt: now,
          revokedById: input.actorId,
          revocationReason: `Parent mandate ${mandate.mandateId} revoked`,
        },
      });
    }
    await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: "USER",
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: AUDIT.MANDATE_REVOKED,
      resourceType: "MANDATE",
      resourceId: mandate.mandateId,
      summary: `Mandate ${mandate.mandateId} revoked.`,
      details: {
        reason: input.reason || "Revoked by owner",
        cascaded_descendants: descendants.length,
      },
    });
    return [mandate.mandateId, ...revokedIds(descendants)];
  });

  return { revoked };
}

function revokedIds(ids: string[]): string[] {
  return ids;
}

export async function listMandatesForOwner(
  ownerId: string,
  filters: { status?: string; search?: string; agentId?: string; currency?: string } = {},
) {
  const where: Prisma.MandateWhereInput = { ownerId };
  if (filters.status && filters.status !== "ALL") {
    if (filters.status === "EXPIRED") {
      // Expiry is time-derived, not a stored status transition.
      where.status = "ACTIVE";
      where.expiresAt = { lte: new Date() };
    } else {
      where.status = filters.status as never;
    }
  }
  if (filters.agentId) where.agentId = filters.agentId;
  if (filters.currency && filters.currency !== "ALL") where.currency = filters.currency;
  if (filters.search) {
    where.OR = [
      { mandateId: { contains: filters.search, mode: "insensitive" } },
      { title: { contains: filters.search, mode: "insensitive" } },
      { agent: { name: { contains: filters.search, mode: "insensitive" } } },
      { scopes: { some: { value: { contains: filters.search, mode: "insensitive" } } } },
    ];
  }

  const mandates = await db.mandate.findMany({
    where,
    include: { scopes: true, agent: true },
    orderBy: [{ createdAt: "desc" }],
  });
  const spend = await loadSpendByMandateIds(mandates.map((mandate) => mandate.id));
  return mandates.map((mandate) => ({
    mandate,
    spend: spend.get(mandate.id) ?? { spent: "0.00", activeCount: 0 },
  }));
}

export async function getMandateDetail(ownerId: string, idOrMandateId: string) {
  const mandate = await db.mandate.findFirst({
    where: {
      ownerId,
      OR: [{ id: idOrMandateId }, { mandateId: idOrMandateId }],
    },
    include: {
      scopes: true,
      agent: true,
      rootAgent: true,
      parentMandate: { include: { scopes: true } },
      childMandates: { include: { agent: true } },
    },
  });
  if (!mandate) return null;

  const spend = await loadSpendForMandate(mandate.id);
  const transactions = await db.transaction.findMany({
    where: { mandateId: mandate.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { proposal: { select: { proposalId: true, merchantName: true } } },
  });
  const decisions = await db.policyDecision.findMany({
    where: { mandateId: mandate.id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const approvals = await db.approvalRequest.findMany({
    where: { mandateId: mandate.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { },
  });

  return { mandate, spend, transactions, decisions, approvals, proof: verifyMandateProof(mandate) };
}

export function normalizeScopeValue(value: string, type: "MERCHANT" | "CATEGORY") {
  return type === "MERCHANT" ? normalizeDomain(value) : normalizeCategory(value);
}
