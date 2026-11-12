import "server-only";
import type { Agent, Mandate, MandateScope, Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { newId, randomToken } from "../ids";
import { platformKeys } from "../crypto/keys";
import {
  evaluatePolicy,
  type AncestorMandateSnapshot,
  type ApprovalSnapshot,
  type MandateSnapshot,
  type PolicyEvaluationResult,
  type PolicyOutcome,
  type ProposalSnapshot,
} from "../policy/engine";
import { ACTIVE_TRANSACTION_STATUSES } from "../domain/constants";
import { formatMoney, money } from "../money";
import { appendAuditEvent, AUDIT } from "../audit";
import { sha256Hex } from "../crypto/canonical";
import { withDeadlockRetry } from "../concurrency";

type Client = Prisma.TransactionClient | typeof db;

export async function spendForMandate(client: Client, mandateId: string) {
  const grouped = await client.transaction.groupBy({
    by: ["mandateId"],
    where: { mandateId, status: { in: ACTIVE_TRANSACTION_STATUSES } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const row = grouped[0];
  return {
    spentTotal: formatMoney(row?._sum.amount ?? 0),
    activeTransactionCount: row?._count._all ?? 0,
  };
}

async function activeChildCommitments(client: Client, parentId: string, excludeId?: string) {
  const rows = await client.mandate.findMany({
    where: {
      parentMandateId: parentId,
      status: "ACTIVE",
      revokedAt: null,
      expiresAt: { gt: new Date() },
      ...(excludeId ? { id: { not: excludeId } } : {}),
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

type MandateWithScopes = Mandate & { scopes: MandateScope[] };

export function toMandateSnapshot(
  mandate: MandateWithScopes,
  spend: {
    spentTotal: string;
    activeTransactionCount: number;
    committedTotal?: string;
    committedTransactions?: number;
  },
): MandateSnapshot {
  return {
    id: mandate.id,
    mandateId: mandate.mandateId,
    ownerId: mandate.ownerId,
    agentId: mandate.agentId,
    rootAgentId: mandate.rootAgentId,
    parentMandateId: mandate.parentMandateId,
    title: mandate.title,
    currency: mandate.currency,
    maxTotal: formatMoney(mandate.maxTotal),
    maxPerTransaction: formatMoney(mandate.maxPerTransaction),
    approvalThreshold: mandate.approvalThreshold === null ? null : formatMoney(mandate.approvalThreshold),
    maxTransactions: mandate.maxTransactions,
    expiresAt: mandate.expiresAt,
    delegationAllowed: mandate.delegationAllowed,
    status: mandate.status,
    signature: mandate.signature,
    signingKeyId: mandate.signingKeyId,
    canonicalHash: mandate.canonicalHash,
    nonce: mandate.nonce,
    issuedAt: mandate.issuedAt,
    revokedAt: mandate.revokedAt,
    scopes: mandate.scopes.map((scope) => ({
      type: scope.type,
      normalizedValue: scope.normalizedValue,
    })),
    ...spend,
  };
}

export async function loadAncestors(
  client: Client,
  mandate: Mandate,
): Promise<AncestorMandateSnapshot[]> {
  const ancestors: AncestorMandateSnapshot[] = [];
  let parentId = mandate.parentMandateId;
  let childId = mandate.id;
  for (let depth = 0; depth < 8 && parentId; depth += 1) {
    const parent = await client.mandate.findUnique({
      where: { id: parentId },
      include: { scopes: true },
    });
    if (!parent) break;
    const spend = await spendForMandate(client, parent.id);
    const children = await activeChildCommitments(client, parent.id, childId);
    ancestors.push({
      id: parent.id,
      mandateId: parent.mandateId,
      agentId: parent.agentId,
      currency: parent.currency,
      maxTotal: formatMoney(parent.maxTotal),
      spentTotal: spend.spentTotal,
      maxPerTransaction: formatMoney(parent.maxPerTransaction),
      approvalThreshold:
        parent.approvalThreshold === null ? null : formatMoney(parent.approvalThreshold),
      committedTotal: formatMoney(money(spend.spentTotal).plus(children.amount)),
      committedTransactions: spend.activeTransactionCount + children.transactions,
      maxTransactions: parent.maxTransactions,
      expiresAt: parent.expiresAt,
      delegationAllowed: parent.delegationAllowed,
      status: parent.status,
      revokedAt: parent.revokedAt,
      scopes: parent.scopes.map((scope) => ({
        type: scope.type,
        normalizedValue: scope.normalizedValue,
      })),
    });
    childId = parent.id;
    parentId = parent.parentMandateId;
  }
  return ancestors;
}

export async function agentLineage(client: Client, agent: Agent): Promise<string[]> {
  const lineage: string[] = [];
  let cursor: Agent | null = agent;
  for (let depth = 0; depth < 12 && cursor; depth += 1) {
    lineage.push(cursor.id);
    cursor = cursor.parentAgentId
      ? await client.agent.findUnique({ where: { id: cursor.parentAgentId } })
      : null;
  }
  return lineage;
}

export async function agentLineageActive(client: Client, agent: Agent): Promise<boolean> {
  let cursor: Agent | null = agent;
  for (let depth = 0; depth < 12 && cursor; depth += 1) {
    if (cursor.status !== "ACTIVE") return false;
    cursor = cursor.parentAgentId
      ? await client.agent.findUnique({ where: { id: cursor.parentAgentId } })
      : null;
  }
  return true;
}

export interface EvaluateProposalInput {
  ownerId: string;
  proposalId: string;
  executionId: string;
  idempotencyKey: string;
  approvalId?: string | null;
  actorId: string;
  actorLabel: string;
  actorType?: "USER" | "AGENT" | "SYSTEM";
}

export interface EvaluationOutcome {
  outcome: PolicyOutcome;
  decision: {
    decisionId: string;
    outcome: PolicyOutcome;
    checks: { id: string; label: string; passed: boolean; detail: string }[];
    failedCheckIds: string[];
    explanation: string;
    createdAt: Date;
  };
  transactionId: string | null;
  approvalId: string | null;
  approvalToken: string | null;
}

async function evaluateWithSnapshot(
  client: Client,
  input: EvaluateProposalInput,
  proposalId: string,
) {
  const proposal = await client.proposal.findFirst({
    where: { id: proposalId, ownerId: input.ownerId },
    include: { agent: true, mandate: { include: { scopes: true } } },
  });
  if (!proposal) throw new AppError("PROPOSAL_NOT_FOUND", "Proposal not found.", 404);

  const spend = await spendForMandate(client, proposal.mandateId);
  const childCommitments = await activeChildCommitments(client, proposal.mandateId);
  const ancestors = await loadAncestors(client, proposal.mandate);
  const lineage = await agentLineage(client, proposal.agent);
  const lineageActive = await agentLineageActive(client, proposal.agent);

  const approval = input.approvalId
    ? await client.approvalRequest.findFirst({
        where: { approvalId: input.approvalId, ownerId: input.ownerId, proposalId: proposal.id },
      })
    : await client.approvalRequest.findFirst({
        where: { proposalId: proposal.id, status: "APPROVED" },
        orderBy: { approvedAt: "desc" },
      });

  const executionSeen = await client.transaction.findFirst({
    where: { executionId: input.executionId },
    select: { id: true },
  });
  const idempotencySeen = await client.transaction.findFirst({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true },
  });

  const approvalSnapshot: ApprovalSnapshot | null = approval
    ? {
        approvalId: approval.approvalId,
        proposalId: approval.proposalId,
        status: approval.status,
        expiresAt: approval.expiresAt,
        approved: approval.status === "APPROVED" && Boolean(approval.approvedAt),
      }
    : null;

  const proposalSnapshot: ProposalSnapshot = {
    id: proposal.id,
    proposalId: proposal.proposalId,
    agentId: proposal.agentId,
    mandateId: proposal.mandateId,
    merchantName: proposal.merchantName,
    merchantId: proposal.merchantId,
    merchantDomain: proposal.merchantDomain,
    category: proposal.category,
    amount: formatMoney(proposal.amount),
    currency: proposal.currency,
    description: proposal.description,
    lineItems: proposal.lineItems,
    signature: proposal.signature,
    canonicalHash: proposal.canonicalHash,
    createdAt: proposal.createdAt,
  };

  const keys = platformKeys();
  const result = evaluatePolicy({
    now: new Date(),
    expectedOwnerId: input.ownerId,
    platformKeyId: keys.keyId,
    platformPublicKeyBase64: keys.publicKeyBase64,
    mandate: toMandateSnapshot(proposal.mandate, {
      ...spend,
      committedTotal: formatMoney(money(spend.spentTotal).plus(childCommitments.amount)),
      committedTransactions: spend.activeTransactionCount + childCommitments.transactions,
    }),
    ancestors,
    agent: {
      id: proposal.agent.id,
      ownerId: proposal.agent.ownerId,
      status: proposal.agent.status,
      tier: proposal.agent.tier,
      parentAgentId: proposal.agent.parentAgentId,
      publicKey: proposal.agent.publicKey,
      lineage,
      lineageActive,
    },
    proposal: proposalSnapshot,
    executionId: input.executionId,
    idempotencyKey: input.idempotencyKey,
    executionReused: Boolean(executionSeen),
    idempotencyReused: Boolean(idempotencySeen),
    approval: approvalSnapshot,
  });

  return { proposal, result };
}

function decisionData(
  input: EvaluateProposalInput,
  proposal: { id: string; mandateId: string; agentId: string; amount: Prisma.Decimal; currency: string },
  result: PolicyEvaluationResult,
) {
  return {
    decisionId: newId("decision"),
    ownerId: input.ownerId,
    proposalId: proposal.id,
    mandateId: proposal.mandateId,
    agentId: proposal.agentId,
    outcome: result.outcome,
    amount: formatMoney(proposal.amount),
    currency: proposal.currency,
    checks: result.checks as unknown as Prisma.InputJsonValue,
    failedChecks: result.failedCheckIds,
    explanation: result.explanation,
    executionId: input.executionId,
    created: result.evaluatedAt,
  };
}

export async function evaluateProposal(input: EvaluateProposalInput): Promise<EvaluationOutcome> {
  const pre = await evaluateWithSnapshot(db, input, input.proposalId);

  if (pre.result.outcome !== "AUTHORIZED") {
    return persistNonAuthorized(input, pre.proposal, pre.result);
  }

  try {
    return await withDeadlockRetry(() => db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Mandate" WHERE id = ${pre.proposal.mandateId} FOR UPDATE`;

      const fresh = await evaluateWithSnapshot(tx, input, pre.proposal.id);
      if (fresh.result.outcome !== "AUTHORIZED") {
        return persistNonAuthorized(input, fresh.proposal, fresh.result, tx);
      }

      const data = decisionData(input, fresh.proposal, fresh.result);
      const decision = await tx.policyDecision.create({
        data: {
          decisionId: data.decisionId,
          ownerId: data.ownerId,
          proposalId: data.proposalId,
          mandateId: data.mandateId,
          agentId: data.agentId,
          outcome: data.outcome,
          amount: data.amount,
          currency: data.currency,
          checks: data.checks,
          failedChecks: data.failedChecks,
          explanation: data.explanation,
          executionId: data.executionId,
          createdAt: data.created,
        },
      });

      const transactionId = newId("transaction");
      await tx.transaction.create({
        data: {
          transactionId,
          ownerId: input.ownerId,
          proposalId: fresh.proposal.id,
          mandateId: fresh.proposal.mandateId,
          agentId: fresh.proposal.agentId,
          merchantName: fresh.proposal.merchantName,
          merchantId: fresh.proposal.merchantId,
          category: fresh.proposal.category,
          amount: formatMoney(fresh.proposal.amount),
          currency: fresh.proposal.currency,
          policyDecisionId: decision.id,
          executionId: input.executionId,
          idempotencyKey: input.idempotencyKey,
          status: "POLICY_APPROVED",
          source: fresh.proposal.source,
        },
      });

      await tx.idempotencyKey.create({
        data: {
          ownerId: input.ownerId,
          key: input.idempotencyKey,
          scope: "policy.evaluate",
          requestHash: sha256Hex(`${fresh.proposal.id}:${input.executionId}`),
          statusCode: 200,
          response: { decisionId: decision.decisionId, transactionId } as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        },
      });

      await tx.proposal.update({
        where: { id: fresh.proposal.id },
        data: { status: "AUTHORIZED" },
      });

      if (input.approvalId) {
        await tx.approvalRequest.updateMany({
          where: { proposalId: fresh.proposal.id, status: "APPROVED" },
          data: { status: "CONSUMED", consumedAt: new Date() },
        });
      }

      const policyAudit = await appendAuditEvent(tx, {
        ownerId: input.ownerId,
        actorType: input.actorType ?? "USER",
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        action: AUDIT.POLICY_EVALUATED,
        resourceType: "POLICY_DECISION",
        resourceId: decision.decisionId,
        summary: `Policy AUTHORIZED ${formatMoney(fresh.proposal.amount)} ${fresh.proposal.currency} to ${fresh.proposal.merchantName}.`,
        details: {
          outcome: "AUTHORIZED",
          mandate_id: fresh.proposal.mandate.mandateId,
          proposal_id: fresh.proposal.proposalId,
          transaction_id: transactionId,
          execution_id: input.executionId,
          checks_passed: fresh.result.checks.filter((entry) => entry.passed).length,
          checks_total: fresh.result.checks.length,
        },
      });

      await tx.transaction.update({
        where: { transactionId },
        data: { auditRefs: { push: policyAudit.eventId } },
      });

      return {
        outcome: "AUTHORIZED" as PolicyOutcome,
        decision: {
          decisionId: decision.decisionId,
          outcome: "AUTHORIZED" as PolicyOutcome,
          checks: fresh.result.checks,
          failedCheckIds: [],
          explanation: fresh.result.explanation,
          createdAt: decision.createdAt,
        },
        transactionId,
        approvalId: null,
        approvalToken: null,
      };
    }));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      const { proposal } = await evaluateWithSnapshot(db, input, input.proposalId);
      const replayResult: PolicyEvaluationResult = {
        outcome: "BLOCKED",
        checks: [
          {
            id: "execution_uniqueness",
            label: "Replay protection",
            passed: false,
            detail: "Execution identifier or idempotency key has already been consumed.",
          },
        ],
        failedCheckIds: ["execution_uniqueness"],
        explanation: "Authorization denied: replay of a consumed execution identifier or idempotency key.",
        evaluatedAt: new Date(),
      };
      return persistNonAuthorized(input, proposal, replayResult);
    }
    throw error;
  }
}

async function persistNonAuthorized(
  input: EvaluateProposalInput,
  proposal: { id: string; mandateId: string; agentId: string; amount: Prisma.Decimal; currency: string },
  result: PolicyEvaluationResult,
  tx?: Prisma.TransactionClient,
): Promise<EvaluationOutcome> {
  const run = async (client: Prisma.TransactionClient) => {
    const data = decisionData(input, proposal, result);
    const decision = await client.policyDecision.create({
      data: {
        decisionId: data.decisionId,
        ownerId: data.ownerId,
        proposalId: data.proposalId,
        mandateId: data.mandateId,
        agentId: data.agentId,
        outcome: data.outcome,
        amount: data.amount,
        currency: data.currency,
        checks: data.checks,
        failedChecks: data.failedChecks,
        explanation: data.explanation,
        executionId: data.executionId,
        createdAt: data.created,
      },
    });

    let approvalId: string | null = null;
    let approvalTokenValue: string | null = null;

    if (result.outcome === "REQUIRES_USER_APPROVAL") {
      const token = randomToken(24);
      const approval = await client.approvalRequest.upsert({
        where: { proposalId: proposal.id },
        create: {
          approvalId: newId("approval"),
          ownerId: input.ownerId,
          proposalId: proposal.id,
          mandateId: proposal.mandateId,
          status: "PENDING",
          tokenHash: sha256Hex(token),
          expiresAt: new Date(Date.now() + 1000 * 60 * 15),
        },
        update: {
          status: "PENDING",
          tokenHash: sha256Hex(token),
          expiresAt: new Date(Date.now() + 1000 * 60 * 15),
        },
      });
      approvalId = approval.approvalId;
      approvalTokenValue = token;
      await client.policyDecision.update({
        where: { id: decision.id },
        data: { approvalId },
      });
    }

    await client.proposal.update({
      where: { id: proposal.id },
      data: {
        status:
          result.outcome === "REQUIRES_USER_APPROVAL"
            ? "APPROVAL_REQUIRED"
            : result.outcome === "AUTHORIZED"
              ? "AUTHORIZED"
              : "BLOCKED",
      },
    });

    await appendAuditEvent(client, {
      ownerId: input.ownerId,
      actorType: input.actorType ?? "USER",
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action:
        result.outcome === "REQUIRES_USER_APPROVAL"
          ? AUDIT.POLICY_APPROVAL_REQUIRED
          : AUDIT.POLICY_BLOCKED,
      resourceType: "POLICY_DECISION",
      resourceId: decision.decisionId,
      summary: `Policy ${result.outcome} for ${formatMoney(proposal.amount)} ${proposal.currency} proposal.`,
      details: {
        outcome: result.outcome,
        failed_checks: result.failedCheckIds,
        explanation: result.explanation,
        execution_id: input.executionId,
      },
    });

    return {
      outcome: result.outcome,
      decision: {
        decisionId: decision.decisionId,
        outcome: result.outcome,
        checks: result.checks,
        failedCheckIds: result.failedCheckIds,
        explanation: result.explanation,
        createdAt: decision.createdAt,
      },
      transactionId: null,
      approvalId,
      approvalToken: approvalTokenValue,
    } satisfies EvaluationOutcome;
  };

  if (tx) return run(tx);
  return db.$transaction(run);
}

export async function approveProposal(input: {
  ownerId: string;
  approvalId: string;
  actorId: string;
  actorLabel: string;
  decision: "APPROVE" | "REJECT";
}) {
  const approval = await db.approvalRequest.findFirst({
    where: { approvalId: input.approvalId, ownerId: input.ownerId },
    include: { mandate: true },
  });
  if (!approval) throw new AppError("APPROVAL_NOT_FOUND", "Approval request not found.", 404);
  if (approval.expiresAt.getTime() <= Date.now() && input.decision === "APPROVE") {
    throw new AppError("APPROVAL_EXPIRED", "Approval request has expired.", 409);
  }
  if (!["PENDING", "APPROVED"].includes(approval.status)) {
    throw new AppError("APPROVAL_CONSUMED", "Approval request is no longer pending.", 409);
  }

  const updated = await db.$transaction(async (tx) => {
    const record = await tx.approvalRequest.update({
      where: { id: approval.id },
      data:
        input.decision === "APPROVE"
          ? { status: "APPROVED", approvedAt: new Date() }
          : { status: "REJECTED", rejectedAt: new Date() },
    });
    await appendAuditEvent(tx, {
      ownerId: input.ownerId,
      actorType: "USER",
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: input.decision === "APPROVE" ? AUDIT.APPROVAL_GRANTED : AUDIT.APPROVAL_REJECTED,
      resourceType: "APPROVAL",
      resourceId: rewardId(record.approvalId),
      summary: `Owner ${input.decision === "APPROVE" ? "approved" : "rejected"} step-up proposal ${record.proposalId}.`,
      details: { approval_id: record.approvalId, mandate_id: approval.mandate.mandateId },
    });
    return record;
  });

  return updated;
}

function rewardId(value: string) {
  return value;
}

export async function listDecisions(ownerId: string, take = 100) {
  return db.policyDecision.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take,
    include: { proposal: true },
  });
}
