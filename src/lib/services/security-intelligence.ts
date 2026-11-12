import "server-only";
import { db } from "../db";
import { formatMoney } from "../money";

export interface IntelligenceCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface SuspiciousAttempt {
  decisionId: string;
  createdAt: string;
  outcome: string;
  amount: string;
  currency: string;
  merchant: string;
  agent: string;
  mandateId: string;
  explanation: string;
  failedChecks: string[];
  auditEventId: string | null;
}

export interface ViolationCategory {
  id: string;
  label: string;
  count: number;
  detail: string;
}

export interface RevocationEvent {
  eventId: string;
  summary: string;
  createdAt: string;
  resourceId: string | null;
}

const CATEGORY_LABELS: Record<string, { label: string; detail: string }> = {
  merchant_allowlist: { label: "Merchant boundary", detail: "Counterparty outside the signed allowlist" },
  category_allowlist: { label: "Category boundary", detail: "Purchase category outside the signed scope" },
  budget_available: { label: "Budget exhaustion", detail: "Amount exceeded remaining mandate budget" },
  per_transaction_limit: { label: "Per-transaction ceiling", detail: "Single amount exceeded the signed ceiling" },
  execution_uniqueness: { label: "Replay detection", detail: "Consumed execution or idempotency identifier" },
  mandate_signature: { label: "Signature integrity", detail: "Canonical mandate signature did not verify" },
  proposal_signature: { label: "Proposal integrity", detail: "Agent proposal signature did not verify" },
  mandate_not_revoked: { label: "Revoked authority", detail: "Proposal referenced revoked authority" },
  mandate_not_expired: { label: "Expired authority", detail: "Proposal referenced an expired mandate" },
  mandate_status: { label: "Mandate state", detail: "Mandate was not ACTIVE at evaluation time" },
  agent_identity: { label: "Agent identity", detail: "Agent inactive, unbound or owned elsewhere" },
  approval_requirement: { label: "Step-up approval", detail: "Owner approval missing or expired" },
  delegation_parent: { label: "Delegation chain", detail: "Parent authority revoked, expired or undelegatable" },
  delegation_budget: { label: "Delegation budget", detail: "Child ceiling exceeded parent authority" },
  delegation_scope: { label: "Delegation scope", detail: "Child permissions exceeded parent scope" },
  delegation_expiry: { label: "Delegation expiry", detail: "Child expiry exceeded parent validity" },
  delegation_agent_lineage: { label: "Agent lineage", detail: "Child agent was not descended from delegator" },
};

function asChecks(value: unknown): IntelligenceCheck[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is IntelligenceCheck =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as IntelligenceCheck).id === "string" &&
      typeof (entry as IntelligenceCheck).label === "string",
  );
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Aggregates real policy decisions and audit records. No event is synthesized:
 * every count and explanation maps to a row persisted by the authorization
 * engine or the audit chain.
 */
export async function getSecurityIntelligence(ownerId: string, days = 30) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const decisions = await db.policyDecision.findMany({
    where: { ownerId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 2000,
    include: {
      proposal: {
        select: {
          proposalId: true,
          merchantName: true,
          category: true,
          agent: { select: { name: true } },
        },
      },
      mandate: { select: { mandateId: true } },
    },
  });

  const [auditEvents, revocationEvents, revocationCount, attackRuns] = await Promise.all([
    decisions.length > 0
      ? db.auditEvent.findMany({
          where: {
            ownerId,
            resourceType: "POLICY_DECISION",
            resourceId: { in: decisions.map((decision) => decision.decisionId) },
          },
          select: { eventId: true, resourceId: true },
        })
      : Promise.resolve([]),
    db.auditEvent.findMany({
      where: { ownerId, action: "MANDATE_REVOKED", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { eventId: true, summary: true, createdAt: true, resourceId: true },
    }),
    db.auditEvent.count({
      where: { ownerId, action: "MANDATE_REVOKED", createdAt: { gte: since } },
    }),
    db.attackRun.count({ where: { ownerId, executedAt: { gte: since } } }),
  ]);

  const auditByDecision = new Map(
    auditEvents
      .filter((event) => event.resourceId)
      .map((event) => [event.resourceId as string, event.eventId]),
  );

  const trendMap = new Map<string, { label: string; authorized: number; blocked: number; approval: number }>();
  for (let index = 0; index < days; index += 1) {
    const date = new Date(since);
    date.setUTCDate(since.getUTCDate() + index);
    const key = utcDay(date);
    trendMap.set(key, {
      label: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }),
      authorized: 0,
      blocked: 0,
      approval: 0,
    });
  }

  const violations = new Map<string, number>();
  const suspicious: SuspiciousAttempt[] = [];

  for (const decision of decisions) {
    const bucket = trendMap.get(utcDay(decision.createdAt));
    if (bucket) {
      if (decision.outcome === "AUTHORIZED") bucket.authorized += 1;
      else if (decision.outcome === "REQUIRES_USER_APPROVAL") bucket.approval += 1;
      else bucket.blocked += 1;
    }

    const checks = asChecks(decision.checks);
    for (const id of decision.failedChecks) {
      violations.set(id, (violations.get(id) ?? 0) + 1);
    }

    if (decision.outcome !== "AUTHORIZED" && suspicious.length < 12) {
      const failedLabels = checks
        .filter((check) => !check.passed)
        .map((check) => check.label);
      suspicious.push({
        decisionId: decision.decisionId,
        createdAt: decision.createdAt.toISOString(),
        outcome: decision.outcome,
        amount: formatMoney(decision.amount),
        currency: decision.currency,
        merchant: decision.proposal.merchantName,
        agent: decision.proposal.agent.name,
        mandateId: decision.mandate.mandateId,
        explanation: decision.explanation,
        failedChecks: failedLabels.length > 0 ? failedLabels : decision.failedChecks,
        auditEventId: auditByDecision.get(decision.decisionId) ?? null,
      });
    }
  }

  const violationCategories: ViolationCategory[] = [...violations.entries()]
    .map(([id, count]) => {
      const meta = CATEGORY_LABELS[id];
      return {
        id,
        label: meta?.label ?? id.replace(/_/g, " "),
        count,
        detail: meta?.detail ?? "Policy check failed",
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const blocked = decisions.filter((decision) =>
    ["BLOCKED", "REVOKED", "EXPIRED"].includes(decision.outcome),
  ).length;
  const stepUp = decisions.filter((decision) => decision.outcome === "REQUIRES_USER_APPROVAL").length;

  return {
    days,
    totalDecisions: decisions.length,
    authorized: decisions.filter((decision) => decision.outcome === "AUTHORIZED").length,
    blocked,
    stepUp,
    replayAttempts: decisions.filter((decision) => decision.failedChecks.includes("execution_uniqueness")).length,
    budgetAttempts: decisions.filter((decision) =>
      decision.failedChecks.some((id) => ["budget_available", "per_transaction_limit"].includes(id)),
    ).length,
    merchantAttempts: decisions.filter((decision) =>
      decision.failedChecks.some((id) => ["merchant_allowlist", "category_allowlist"].includes(id)),
    ).length,
    revocationCount,
    attackRuns,
    trend: [...trendMap.values()],
    violationCategories,
    suspicious,
    revocations: revocationEvents.map((event) => ({
      eventId: event.eventId,
      summary: event.summary,
      createdAt: event.createdAt.toISOString(),
      resourceId: event.resourceId,
    })) satisfies RevocationEvent[],
  };
}
