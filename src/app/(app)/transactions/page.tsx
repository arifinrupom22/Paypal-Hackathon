import { ScrollText } from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { TransactionLedger, type LedgerRow } from "@/components/tables/transaction-ledger";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const auth = await requirePageAuth();

  const [transactions, agents, settledAgg, total] = await Promise.all([
    db.transaction.findMany({
      where: { ownerId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        mandate: { select: { mandateId: true } },
        proposal: { select: { proposalId: true } },
        policyDecision: { select: { outcome: true } },
      },
    }),
    db.agent.findMany({ where: { ownerId: auth.userId }, select: { id: true, name: true } }),
    db.transaction.aggregate({
      where: { ownerId: auth.userId, status: "SETTLED" },
      _sum: { amount: true },
    }),
    db.transaction.count({ where: { ownerId: auth.userId } }),
  ]);

  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));

  const rows: LedgerRow[] = transactions.map((transaction) => ({
    transactionId: transaction.transactionId,
    createdAt: transaction.createdAt.toISOString(),
    agentName: agentNames.get(transaction.agentId) ?? "Unknown agent",
    merchantName: transaction.merchantName,
    amount: String(transaction.amount),
    currency: transaction.currency,
    mandateId: transaction.mandate.mandateId,
    policyOutcome: transaction.policyDecision.outcome,
    paypalStatus: transaction.paypalStatus ?? "—",
    status: transaction.status,
    category: transaction.category,
    paypalCaptureId: transaction.paypalCaptureId,
    paypalOrderId: transaction.paypalOrderId,
    executionId: transaction.executionId,
    idempotencyKey: transaction.idempotencyKey,
    auditRefs: transaction.auditRefs,
    failureMessage: transaction.failureMessage,
    proposalId: transaction.proposal.proposalId,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="pill border-line bg-surface-input text-ink-muted">
            <ScrollText className="h-3 w-3 text-teal" />
            Vault ledger
          </span>
          <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-ink">Transaction Ledger</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-secondary">
            Complete record of agent payment authorizations, deterministic policy checks and
            verified PayPal settlements. Every row is read from PostgreSQL.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total entries", value: String(total), detail: "authorized transactions" },
          { label: "Settled volume", value: formatCurrency(settledAgg._sum.amount ?? 0, "USD"), detail: "verified PayPal captures" },
          { label: "Authorized decisions", value: String(rows.filter((row) => row.policyOutcome === "AUTHORIZED").length), detail: "policy engine approvals" },
          { label: "Capture complete", value: String(rows.filter((row) => row.status === "SETTLED").length), detail: "settled execution status" },
        ].map((stat) => (
          <Card key={stat.label} className="p-5">
            <p className="label-mono text-[9px]">{stat.label}</p>
            <p className="mono-value mt-2 text-[22px] text-ink">{stat.value}</p>
            <p className="mt-1 text-[10px] text-ink-muted">{stat.detail}</p>
          </Card>
        ))}
      </div>

      <TransactionLedger rows={rows} />

      <p className="text-[10px] leading-4 text-ink-muted">
        Policy-blocked proposals intentionally never become transactions: they are preserved as
        immutable policy decisions and hash-chained audit events, keeping the ledger a record of
        authorized execution only.
      </p>
    </div>
  );
}
