import "server-only";
import { db } from "../db";
import { ACTIVE_TRANSACTION_STATUSES } from "../domain/constants";
import { formatMoney, money } from "../money";

export interface DashboardMetrics {
  activeMandates: number;
  registeredAgents: number;
  authorizedTransactions: number;
  blockedEvaluations: number;
  authorizedSpend: string;
  settledSpend: string;
  pendingApprovals: number;
  revokedMandates: number;
  expiringSoon: number;
  totalBudget: string;
  remainingBudget: string;
  totalTransactions: number;
  approvalRequired: number;
}

export async function getMetrics(ownerId: string): Promise<DashboardMetrics> {
  const now = new Date();
  const [
    activeMandates,
    registeredAgents,
    authorizedTransactions,
    blockedEvaluations,
    approvalRequired,
    settledAgg,
    reservedAgg,
    pendingApprovals,
    revokedMandates,
    expiringSoon,
    mandateBudget,
    totalTransactions,
  ] = await Promise.all([
    db.mandate.count({ where: { ownerId, status: "ACTIVE", expiresAt: { gt: now }, revokedAt: null } }),
    db.agent.count({ where: { ownerId, status: "ACTIVE" } }),
    db.policyDecision.count({ where: { ownerId, outcome: "AUTHORIZED" } }),
    db.policyDecision.count({ where: { ownerId, outcome: "BLOCKED" } }),
    db.policyDecision.count({ where: { ownerId, outcome: "REQUIRES_USER_APPROVAL" } }),
    db.transaction.aggregate({
      where: { ownerId, status: "SETTLED" },
      _sum: { amount: true },
    }),
    db.transaction.aggregate({
      where: { ownerId, status: { in: ACTIVE_TRANSACTION_STATUSES } },
      _sum: { amount: true },
    }),
    db.approvalRequest.count({ where: { ownerId, status: "PENDING", expiresAt: { gt: now } } }),
    db.mandate.count({ where: { ownerId, status: "REVOKED" } }),
    db.mandate.count({
      where: {
        ownerId,
        status: "ACTIVE",
        revokedAt: null,
        expiresAt: { gt: now, lt: new Date(now.getTime() + 1000 * 60 * 60 * 48) },
      },
    }),
    db.mandate.aggregate({
      where: { ownerId, status: "ACTIVE", revokedAt: null },
      _sum: { maxTotal: true },
    }),
    db.transaction.count({ where: { ownerId } }),
  ]);

  const budget = money(mandateBudget._sum.maxTotal ?? 0);
  const reserved = money(reservedAgg._sum.amount ?? 0);

  return {
    activeMandates,
    registeredAgents,
    authorizedTransactions,
    blockedEvaluations,
    authorizedSpend: formatMoney(reserved),
    settledSpend: formatMoney(settledAgg._sum.amount ?? 0),
    pendingApprovals,
    revokedMandates,
    expiringSoon,
    totalBudget: formatMoney(budget),
    remainingBudget: formatMoney(budget.minus(reserved).greaterThan(0) ? budget.minus(reserved) : 0),
    totalTransactions,
    approvalRequired,
  };
}

export interface StreamPoint {
  bucket: string;
  label: string;
  authorized: number;
  blocked: number;
  approval: number;
}

export async function getAuthorizationStream(ownerId: string, hours = 24): Promise<StreamPoint[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const decisions = await db.policyDecision.findMany({
    where: { ownerId, createdAt: { gte: since } },
    select: { createdAt: true, outcome: true },
    orderBy: { createdAt: "asc" },
  });

  const buckets = new Map<string, StreamPoint>();
  for (let index = hours - 1; index >= 0; index -= 1) {
    const point = new Date();
    point.setMinutes(0, 0, 0);
    point.setHours(point.getHours() - index);
    const key = point.toISOString();
    buckets.set(key, {
      bucket: key,
      label: point.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
      authorized: 0,
      blocked: 0,
      approval: 0,
    });
  }

  for (const decision of decisions) {
    const bucket = new Date(decision.createdAt);
    bucket.setMinutes(0, 0, 0);
    const point = buckets.get(bucket.toISOString());
    if (!point) continue;
    if (decision.outcome === "AUTHORIZED") point.authorized += 1;
    else if (decision.outcome === "REQUIRES_USER_APPROVAL") point.approval += 1;
    else point.blocked += 1;
  }

  return Array.from(buckets.values());
}

export async function getCategoryDistribution(ownerId: string) {
  const rows = await db.transaction.groupBy({
    by: ["category"],
    where: { ownerId, status: { in: ACTIVE_TRANSACTION_STATUSES } },
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 6,
  });
  const total = rows.reduce((sum, row) => sum.plus(money(row._sum.amount ?? 0)), money(0));
  return rows.map((row) => {
    const amount = money(row._sum.amount ?? 0);
    return {
      category: row.category,
      amount: formatMoney(amount),
      count: row._count._all,
      share: total.greaterThan(0) ? amount.dividedBy(total).times(100).toFixed(1) : "0.0",
    };
  });
}

export async function getDailyDecisionSeries(ownerId: string, days = 7) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const decisions = await db.policyDecision.findMany({
    where: { ownerId, createdAt: { gte: since } },
    select: { createdAt: true, outcome: true },
  });

  const series = Array.from({ length: days }, (_, index) => {
    const date = new Date(since);
    date.setUTCDate(since.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }),
      authorized: 0,
      blocked: 0,
      approval: 0,
    };
  });

  for (const decision of decisions) {
    const key = decision.createdAt.toISOString().slice(0, 10);
    const point = series.find((entry) => entry.date === key);
    if (!point) continue;
    if (decision.outcome === "AUTHORIZED") point.authorized += 1;
    else if (decision.outcome === "REQUIRES_USER_APPROVAL") point.approval += 1;
    else point.blocked += 1;
  }

  return series;
}

export async function getRecentTransactions(ownerId: string, take = 8) {
  return db.transaction.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      proposal: { select: { proposalId: true } },
      mandate: { select: { mandateId: true } },
    },
  });
}

export async function getRecentSecurityEvents(ownerId: string, take = 6) {
  return db.auditEvent.findMany({
    where: {
      ownerId,
      action: {
        in: [
          "POLICY_BLOCKED",
          "POLICY_APPROVAL_REQUIRED",
          "MANDATE_REVOKED",
          "AGENT_SUSPENDED",
          "PAYMENT_FAILED",
          "SECURITY_TEST_EXECUTED",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getDashboardData(ownerId: string) {
  const [metrics, stream, categories, daily, transactions, securityEvents, mandates, agents] =
    await Promise.all([
      getMetrics(ownerId),
      getAuthorizationStream(ownerId),
      getCategoryDistribution(ownerId),
      getDailyDecisionSeries(ownerId),
      getRecentTransactions(ownerId, 8),
      getRecentSecurityEvents(ownerId, 6),
      db.mandate.findMany({
        where: { ownerId, status: "ACTIVE", revokedAt: null },
        orderBy: { createdAt: "desc" },
        take: 4,
        include: { scopes: true, agent: true },
      }),
      db.agent.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, take: 8 }),
    ]);

  const spendRows = await db.transaction.groupBy({
    by: ["mandateId"],
    where: { ownerId, status: { in: ACTIVE_TRANSACTION_STATUSES } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const spendMap = new Map(
    spendRows.map((row) => [
      row.mandateId,
      { spent: formatMoney(row._sum.amount ?? 0), count: row._count._all },
    ]),
  );

  return { metrics, stream, categories, daily, transactions, securityEvents, mandates, agents, spendMap };
}
