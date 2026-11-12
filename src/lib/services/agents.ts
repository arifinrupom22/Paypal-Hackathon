import "server-only";
import type { Agent } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { createAgentKeyPair } from "../crypto/agent-keys";
import { appendAuditEvent, AUDIT } from "../audit";
import { ACTIVE_TRANSACTION_STATUSES } from "../domain/constants";
import { formatMoney } from "../money";

export interface RegisterAgentInput {
  ownerId: string;
  actorId: string;
  actorLabel: string;
  name: string;
  description?: string;
  parentAgentId?: string | null;
}

export async function registerAgent(input: RegisterAgentInput) {
  const existing = await db.agent.findFirst({
    where: { ownerId: input.ownerId, name: input.name },
  });
  if (existing) {
    throw new AppError("AGENT_NAME_TAKEN", "An agent with that name already exists.", 409);
  }

  let parent: Agent | null = null;
  if (input.parentAgentId) {
    parent = await db.agent.findFirst({
      where: { id: input.parentAgentId, ownerId: input.ownerId },
    });
    if (!parent) throw new AppError("PARENT_AGENT_NOT_FOUND", "Parent agent not found.", 404);
    if (parent.status !== "ACTIVE") {
      throw new AppError("PARENT_AGENT_INACTIVE", "Parent agent is not active.", 409);
    }
  }

  const keys = createAgentKeyPair();

  const agent = await db.$transaction(async (tx) => {
    const created = await tx.agent.create({
      data: {
        ownerId: input.ownerId,
        name: input.name,
        description: input.description || null,
        tier: parent ? "CHILD" : "ROOT",
        parentAgentId: parent?.id ?? null,
        publicKey: keys.publicKeyBase64,
        credentialCiphertext: keys.encryptedPrivateKey,
        keyFingerprint: keys.fingerprint,
      },
    });
    await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: "USER",
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: AUDIT.AGENT_REGISTERED,
      resourceType: "AGENT",
      resourceId: created.id,
      summary: `Agent ${created.name} registered with an Ed25519 identity.`,
      details: {
        tier: created.tier,
        parent_agent: parent?.name ?? null,
        key_fingerprint: keys.fingerprint,
      },
    });
    return created;
  });

  return { agent, parent };
}

export interface AgentOverview {
  agent: Agent;
  parentName: string | null;
  mandateCount: number;
  activeMandates: number;
  spend: string;
  transactionCount: number;
  limits: { maxTotal: string; used: string } | null;
}

export async function listAgentsForOwner(ownerId: string): Promise<AgentOverview[]> {
  const agents = await db.agent.findMany({
    where: { ownerId },
    include: {
      parentAgent: { select: { name: true } },
      mandates: { select: { id: true, status: true, maxTotal: true } },
    },
    orderBy: [{ tier: "asc" }, { name: "asc" }],
  });

  const spendRows = await db.transaction.groupBy({
    by: ["agentId"],
    where: { ownerId, status: { in: ACTIVE_TRANSACTION_STATUSES } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const spendMap = new Map(
    spendRows.map((row) => [
      row.agentId,
      { amount: formatMoney(row._sum.amount ?? 0), count: row._count._all },
    ]),
  );

  return agents.map((agent) => {
    const total = agent.mandates.reduce((sum, mandate) => sum + Number(mandate.maxTotal), 0);
    const spend = spendMap.get(agent.id);
    return {
      agent,
      parentName: agent.parentAgent?.name ?? null,
      mandateCount: agent.mandates.length,
      activeMandates: agent.mandates.filter((mandate) => mandate.status === "ACTIVE").length,
      spend: spend?.amount ?? "0.00",
      transactionCount: spend?.count ?? 0,
      limits: total > 0 ? { maxTotal: total.toFixed(2), used: spend?.amount ?? "0.00" } : null,
    };
  });
}

export async function getAgentDetail(ownerId: string, agentId: string) {
  const agent = await db.agent.findFirst({
    where: { id: agentId, ownerId },
    include: {
      parentAgent: true,
      children: true,
      mandates: {
        include: { scopes: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!agent) return null;

  const spendRows = await db.transaction.groupBy({
    by: ["mandateId"],
    where: { agentId: agent.id, status: { in: ACTIVE_TRANSACTION_STATUSES } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const spendMap = new Map(
    spendRows.map((row) => [
      row.mandateId,
      { amount: formatMoney(row._sum.amount ?? 0), count: row._count._all },
    ]),
  );

  const transactions = await db.transaction.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { mandate: { select: { mandateId: true } } },
  });

  const decisions = await db.policyDecision.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const auditEvents = await db.auditEvent.findMany({
    where: { ownerId, resourceType: "AGENT", resourceId: agent.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return { agent, spendMap, transactions, decisions, auditEvents };
}

export async function suspendAgent(input: {
  ownerId: string;
  agentId: string;
  actorId: string;
  actorLabel: string;
}) {
  const agent = await db.agent.findFirst({ where: { id: input.agentId, ownerId: input.ownerId } });
  if (!agent) throw new AppError("AGENT_NOT_FOUND", "Agent not found.", 404);
  if (agent.status === "SUSPENDED") {
    throw new AppError("AGENT_ALREADY_SUSPENDED", "Agent is already suspended.", 409);
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.agent.update({
      where: { id: agent.id },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
    await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: "USER",
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: AUDIT.AGENT_SUSPENDED,
      resourceType: "AGENT",
      resourceId: agent.id,
      summary: `Agent ${agent.name} suspended. All pending policy decisions for this agent will be blocked.`,
      details: { key_fingerprint: agent.keyFingerprint },
    });
    return updated;
  });
}

export async function resumeAgent(input: {
  ownerId: string;
  agentId: string;
  actorId: string;
  actorLabel: string;
}) {
  const agent = await db.agent.findFirst({ where: { id: input.agentId, ownerId: input.ownerId } });
  if (!agent) throw new AppError("AGENT_NOT_FOUND", "Agent not found.", 404);
  if (agent.status !== "SUSPENDED") {
    throw new AppError("AGENT_NOT_SUSPENDED", "Agent is not suspended.", 409);
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.agent.update({
      where: { id: agent.id },
      data: { status: "ACTIVE", suspendedAt: null },
    });
    await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: "USER",
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: AUDIT.AGENT_RESUMED,
      resourceType: "AGENT",
      resourceId: agent.id,
      summary: `Agent ${agent.name} resumed.`,
      details: {},
    });
    return updated;
  });
}
