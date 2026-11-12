import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { newId } from "../ids";
import { formatMoney, money, normalizeCategory, normalizeCurrency } from "../money";
import { buildProposalPayload } from "../crypto/mandate-payload";
import { signAsAgent } from "../crypto/agent-keys";
import { appendAuditEvent, AUDIT } from "../audit";
import { selectCatalogItem } from "../ai/purchasing";
import { db as database } from "../db";

export interface CreateProposalInput {
  ownerId: string;
  actorId: string;
  actorLabel: string;
  mandateId: string;
  agentId?: string;
  merchantName: string;
  merchantId?: string | null;
  merchantDomain?: string | null;
  category: string;
  amount: string;
  currency: string;
  description: string;
  lineItems?: Record<string, unknown>[];
  source?: "AGENT" | "MANUAL" | "SECURITY_TEST";
  aiModel?: string | null;
  aiRationale?: string | null;
  rawInstruction?: string | null;
}

export async function createProposal(input: CreateProposalInput) {
  const mandate = await db.mandate.findFirst({
    where: { id: input.mandateId, ownerId: input.ownerId },
    include: { agent: true },
  });
  if (!mandate) throw new AppError("MANDATE_NOT_FOUND", "Mandate not found.", 404);
  if (mandate.status !== "ACTIVE" || mandate.revokedAt) {
    throw new AppError("MANDATE_INACTIVE", "Mandate is not active.", 409);
  }

  const agent = mandate.agent;
  if (agent.status !== "ACTIVE") {
    throw new AppError("AGENT_INACTIVE", "The mandate's agent is not active.", 409);
  }

  const amount = money(input.amount);
  if (!amount.greaterThan(0)) {
    throw new AppError("AMOUNT_INVALID", "Proposal amount must be greater than zero.", 422);
  }

  const proposalId = newId("proposal");
  const createdAt = new Date();
  const currency = normalizeCurrency(input.currency);
  const lineItems = (input.lineItems ?? []) as Prisma.InputJsonValue;

  const payload = buildProposalPayload({
    proposalId,
    agentId: agent.id,
    mandateId: mandate.id,
    merchantName: input.merchantName,
    merchantId: input.merchantId ?? null,
    merchantDomain: input.merchantDomain ?? null,
    category: normalizeCategory(input.category),
    amount: amount.toFixed(2),
    currency,
    description: input.description,
    lineItems,
    createdAt,
  });
  const signature = signAsAgent(agent.credentialCiphertext, payload);

  const proposal = await db.$transaction(async (tx) => {
    const created = await tx.proposal.create({
      data: {
        proposalId,
        ownerId: input.ownerId,
        agentId: agent.id,
        mandateId: mandate.id,
        merchantName: input.merchantName,
        merchantId: input.merchantId ?? null,
        merchantDomain: input.merchantDomain ?? null,
        category: normalizeCategory(input.category),
        amount: amount.toFixed(2),
        currency,
        description: input.description,
        lineItems,
        source: input.source ?? "MANUAL",
        aiModel: input.aiModel ?? null,
        aiRationale: input.aiRationale ?? null,
        rawInstruction: input.rawInstruction ?? null,
        signature: signature.signature,
        canonicalHash: signature.canonicalHash,
        createdAt,
      },
    });

    await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: input.source === "SECURITY_TEST" ? "SYSTEM" : "AGENT",
      actorId: agent.id,
      actorLabel: agent.name,
      action: AUDIT.PROPOSAL_CREATED,
      resourceType: "PROPOSAL",
      resourceId: created.proposalId,
      summary: `Proposal ${created.proposalId} signed by ${agent.name} for ${formatMoney(amount)} ${currency}.`,
      details: {
        mandate_id: mandate.mandateId,
        merchant: input.merchantName,
        category: normalizeCategory(input.category),
        amount: amount.toFixed(2),
        currency,
        source: input.source ?? "MANUAL",
        agent_signature_hash: signature.canonicalHash,
      },
    });

    return created;
  });

  return { proposal, agent, mandate };
}

export async function listProposals(ownerId: string, take = 25) {
  return db.proposal.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      mandate: { select: { mandateId: true, title: true } },
      agent: { select: { name: true, tier: true } },
      policyDecisions: { orderBy: { createdAt: "desc" }, take: 1 },
      transaction: { select: { transactionId: true, status: true } },
    },
  });
}

export async function getProposal(ownerId: string, proposalId: string) {
  return db.proposal.findFirst({
    where: { ownerId, OR: [{ id: proposalId }, { proposalId }] },
    include: {
      mandate: { include: { scopes: true } },
      agent: true,
      policyDecisions: { orderBy: { createdAt: "desc" } },
      transaction: true,
    },
  });
}

export async function createAgentPurchaseProposal(input: {
  ownerId: string;
  actorId: string;
  actorLabel: string;
  mandateId: string;
  instruction: string;
  sku?: string;
}) {
  const mandate = await database.mandate.findFirst({
    where: { id: input.mandateId, ownerId: input.ownerId },
    include: { agent: true },
  });
  if (!mandate) throw new AppError("MANDATE_NOT_FOUND", "Mandate not found.", 404);
  if (mandate.status !== "ACTIVE" || mandate.revokedAt) {
    throw new AppError("MANDATE_INACTIVE", "Mandate is not active.", 409);
  }

  const items = await database.catalogItem.findMany({ where: { inStock: true } });
  const catalog = input.sku
    ? items.filter((item) => item.sku === input.sku)
    : items.filter((item) => item.currency === mandate.currency);

  if (catalog.length === 0) {
    throw new AppError("CATALOG_EMPTY", "No catalog item matches the request.", 404);
  }

  const selection = input.sku
    ? {
        item: catalog[0],
        rationale: "SKU selected explicitly by the operator.",
        engine: "deterministic" as const,
        model: "operator-selection",
        configured: true,
      }
    : await selectCatalogItem({ instruction: input.instruction, items: catalog });

  if (!selection) {
    throw new AppError("NO_CATALOG_MATCH", "No catalog item matches the instruction.", 404);
  }

  const item = selection.item;

  const created = await createProposal({
    ownerId: input.ownerId,
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    mandateId: mandate.id,
    agentId: mandate.agentId,
    merchantName: item.merchant,
    merchantId: item.merchantId,
    merchantDomain: item.domain,
    category: item.category,
    amount: money(item.price).toFixed(2),
    currency: item.currency,
    description: `${item.name} — ${input.instruction}`.slice(0, 900),
    lineItems: [
      {
        sku: item.sku,
        name: item.name,
        quantity: 1,
        unit_price: money(item.price).toFixed(2),
        currency: item.currency,
      },
    ],
    source: "AGENT",
    aiModel: selection.model,
    aiRationale: selection.rationale,
    rawInstruction: input.instruction,
  });

  return {
    ...created,
    selection: {
      sku: item.sku,
      name: item.name,
      merchant: item.merchant,
      amount: money(item.price).toFixed(2),
      currency: item.currency,
      rationale: selection.rationale,
      engine: selection.engine,
      model: selection.model,
      configured: selection.configured,
    },
  };
}
