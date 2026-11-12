import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileCheck2, ShieldCheck } from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { getTransactionDetail } from "@/lib/services/transactions";
import { AuthorizationTrace, type TraceCheck } from "@/components/transactions/authorization-trace";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { formatCurrency } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TransactionTracePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const detail = await getTransactionDetail(auth.userId, id);
  if (!detail) notFound();

  const { transaction, auditEvents } = detail;
  const checks = ((transaction.policyDecision.checks ?? []) as unknown as TraceCheck[]).filter(
    (check) => check && typeof check.id === "string",
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="h-3 w-3" /> Transaction Ledger
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={transaction.status} />
            <Badge tone={transaction.policyDecision.outcome === "AUTHORIZED" ? "emerald" : "crimson"}>
              {transaction.policyDecision.outcome}
            </Badge>
            <span className="mono-value text-[10px] text-ink-muted">{transaction.transactionId}</span>
            <CopyButton value={transaction.transactionId} label="Copy ID" />
          </div>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ink">
            {transaction.merchantName}
          </h1>
          <p className="mt-1 text-[12px] text-ink-secondary">
            {formatCurrency(transaction.amount, transaction.currency)} · {transaction.category} ·
            created {formatDateTime(transaction.createdAt)}
          </p>
        </div>
        <Link href={`/mandates/${transaction.mandate.mandateId}`} className="text-[11px] text-teal hover:underline">
          Inspect mandate proof →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "PACT authorization",
            value: transaction.policyDecision.outcome,
            detail: transaction.policyDecision.decisionId,
          },
          {
            label: "Reserved amount",
            value: formatCurrency(transaction.amount, transaction.currency),
            detail: `execution ${transaction.executionId}`,
          },
          {
            label: "PayPal approval",
            value: transaction.paypalOrderId ? transaction.paypalStatus ?? "order created" : "not started",
            detail: transaction.paypalOrderId ?? "No provider order",
          },
          {
            label: "Verified capture",
            value: transaction.paypalCaptureId ? String(transaction.capturedAmount ?? "captured") : "not captured",
            detail: transaction.capturedAt ? formatDateTime(transaction.capturedAt) : "Settlement is not claimed",
          },
        ].map((stat) => (
          <Card key={stat.label} className="p-5">
            <p className="label-mono text-[9px]">{stat.label}</p>
            <p className="mono-value mt-2 truncate text-[18px] text-ink">{stat.value}</p>
            <p className="mono-value mt-1 truncate text-[9px] text-ink-muted">{stat.detail}</p>
          </Card>
        ))}
      </div>

      <AuthorizationTrace
        transaction={{
          transactionId: transaction.transactionId,
          status: transaction.status,
          amount: String(transaction.amount),
          currency: transaction.currency,
          merchantName: transaction.merchantName,
          category: transaction.category,
          createdAt: transaction.createdAt.toISOString(),
          paypalOrderId: transaction.paypalOrderId,
          paypalCaptureId: transaction.paypalCaptureId,
          paypalStatus: transaction.paypalStatus,
          capturedAmount: transaction.capturedAmount ? String(transaction.capturedAmount) : null,
          reservedAt: transaction.reservedAt.toISOString(),
          capturedAt: transaction.capturedAt?.toISOString() ?? null,
          failureMessage: transaction.failureMessage,
        }}
        proposal={{
          proposalId: transaction.proposal.proposalId,
          description: transaction.proposal.description,
          signature: transaction.proposal.signature,
          canonicalHash: transaction.proposal.canonicalHash,
          aiModel: transaction.proposal.aiModel,
          aiRationale: transaction.proposal.aiRationale,
          rawInstruction: transaction.proposal.rawInstruction,
          createdAt: transaction.proposal.createdAt.toISOString(),
        }}
        decision={{
          decisionId: transaction.policyDecision.decisionId,
          outcome: transaction.policyDecision.outcome,
          explanation: transaction.policyDecision.explanation,
          failedChecks: transaction.policyDecision.failedChecks,
          checks,
          createdAt: transaction.policyDecision.createdAt.toISOString(),
        }}
        mandate={{
          mandateId: transaction.mandate.mandateId,
          title: transaction.mandate.title,
          status: transaction.mandate.status,
          maxTotal: String(transaction.mandate.maxTotal),
          maxPerTransaction: String(transaction.mandate.maxPerTransaction),
          expiresAt: transaction.mandate.expiresAt.toISOString(),
          revokedAt: transaction.mandate.revokedAt?.toISOString() ?? null,
        }}
        agent={{ name: transaction.mandate.agent.name, status: transaction.mandate.agent.status }}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-0">
          <div className="p-5 pb-3">
            <CardHeader
              title="Audit evidence"
              description="Hash-chained events linked to this execution."
              action={<Badge tone="teal">{auditEvents.length} records</Badge>}
            />
          </div>
          {auditEvents.length > 0 ? (
            <div className="divide-y divide-line-soft">
              {auditEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/audit?eventId=${encodeURIComponent(event.eventId)}`}
                  className="flex items-start justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-raised"
                >
                  <div className="min-w-0">
                    <p className="mono-value text-[10px] text-teal">{event.eventId}</p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-secondary">{event.summary}</p>
                  </div>
                  <span className="mono-value shrink-0 text-[9px] text-ink-muted">
                    {formatDateTime(event.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="px-5 pb-5 text-[11px] text-ink-muted">
              No linked audit records were found for this execution.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Proposal signature" description="The agent intent that PACT evaluated." />
          <div className="mt-3 space-y-2 text-[10px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-muted">Canonical hash</span>
              <span className="mono-value flex min-w-0 items-center gap-2 text-ink">
                <span className="truncate">{transaction.proposal.canonicalHash}</span>
                <CopyButton value={transaction.proposal.canonicalHash} label="Copy" />
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-muted">Signature</span>
              <span className="mono-value flex min-w-0 items-center gap-2 text-ink">
                <span className="truncate">{transaction.proposal.signature}</span>
                <CopyButton value={transaction.proposal.signature} label="Copy" />
              </span>
            </div>
            {transaction.proposal.rawInstruction ? (
              <div className="rounded-lg border border-line bg-surface-input p-3">
                <p className="label-mono text-[8px]">Raw AI instruction (data, not authority)</p>
                <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
                  {transaction.proposal.rawInstruction}
                </p>
              </div>
            ) : null}
            <p className="flex items-center gap-1.5 pt-1 text-[10px] text-ink-muted">
              <ShieldCheck className="h-3 w-3 text-teal" />
              Saved only after the policy engine verified the signed proposal.
            </p>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface/60 px-4 py-3 text-[10px] text-ink-muted">
        <span className="flex items-center gap-2">
          <FileCheck2 className="h-3.5 w-3.5 text-teal" />
          Decision latency {transaction.policyDecision.decisionLatency}ms · execution{" "}
          <span className="mono-value text-ink-secondary">{transaction.executionId}</span>
        </span>
        <span className="mono-value">PACT authorization ≠ PayPal buyer approval</span>
      </div>
    </div>
  );
}
