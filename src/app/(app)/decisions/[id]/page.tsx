import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Fingerprint,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { getDecisionDetail } from "@/lib/services/decisions";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { formatCurrency } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type { TraceCheck } from "@/components/transactions/authorization-trace";

export const dynamic = "force-dynamic";

export default async function DecisionExplainPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const detail = await getDecisionDetail(auth.userId, id);
  if (!detail) notFound();

  const { decision, auditEvents } = detail;
  const checks = ((decision.checks ?? []) as unknown as TraceCheck[]).filter(
    (check) => check && typeof check.id === "string",
  );
  const passed = checks.filter((check) => check.passed);
  const failed = checks.filter((check) => !check.passed);
  const needsApproval = decision.outcome === "REQUIRES_USER_APPROVAL";
  const checkState = (ids: string[]) => {
    const subset = checks.filter((check) => ids.includes(check.id));
    if (subset.length === 0) return "not recorded";
    return subset.every((check) => check.passed) ? "verified" : "failed";
  };

  const stageSummary = [
    {
      label: "AI proposal",
      detail: decision.proposal.proposalId,
      state: "signed",
    },
    {
      label: "Mandate",
      detail: decision.mandate.mandateId,
      state: checkState(
        checks.filter((check) => check.id.startsWith("mandate_")).map((check) => check.id),
      ),
    },
    {
      label: "Agent permission",
      detail: decision.proposal.agent.name,
      state: checkState(
        checks
          .filter(
            (check) =>
              check.id === "agent_identity" ||
              check.id === "proposal_signature" ||
              check.id.startsWith("delegation_"),
          )
          .map((check) => check.id),
      ),
    },
    {
      label: "Budget",
      detail: `${decision.amount} ${decision.currency}`,
      state: checkState(
        checks
          .filter((check) =>
            ["budget_available", "per_transaction_limit", "transaction_count"].includes(check.id),
          )
          .map((check) => check.id),
      ),
    },
    {
      label: "Policy",
      detail: decision.outcome,
      state: decision.outcome === "AUTHORIZED" ? "authorized" : needsApproval ? "approval" : "blocked",
    },
    {
      label: "PayPal",
      detail: decision.transaction ? decision.transaction.paypalOrderId ?? "order pending" : "not reached",
      state: decision.transaction ? "created" : "not_reached",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/mandates/${decision.mandate.mandateId}`}
          className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" /> Mandate {decision.mandate.mandateId}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={decision.outcome} />
          <Badge tone={decision.outcome === "AUTHORIZED" ? "emerald" : needsApproval ? "amber" : "crimson"}>
            {decision.outcome === "AUTHORIZED" ? "Permitted" : needsApproval ? "Owner action required" : "Denied"}
          </Badge>
          <span className="mono-value text-[10px] text-ink-muted">{decision.decisionId}</span>
          <CopyButton value={decision.decisionId} label="Copy ID" />
        </div>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ink">
          {decision.proposal.merchantName}
        </h1>
        <p className="mt-1 text-[12px] text-ink-secondary">
          {formatCurrency(decision.amount, decision.currency)} · {decision.proposal.category} ·{" "}
          {decision.proposal.agent.name} · {formatDateTime(decision.createdAt)}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {stageSummary.map((stage) => (
            <div key={stage.label} className="rounded-lg border border-line bg-surface-input p-3">
              <p className="label-mono text-[7px]">{stage.label}</p>
              <p className="mt-1 text-[10px] text-ink">{stage.state.replace(/_/g, " ")}</p>
              <p className="mono-value mt-1 truncate text-[8px] text-ink-muted">{stage.detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface-input p-3 text-[11px] leading-5 text-ink-secondary">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
          {decision.explanation}
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Conditions evaluated"
            description="Every check returned by the deterministic engine for this exact proposal."
            action={<Badge tone={failed.length ? "amber" : "emerald"}>{checks.length} checks</Badge>}
          />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="label-mono flex items-center gap-1.5 text-[8px] text-emerald">
                <CheckCircle2 className="h-3 w-3" /> Passed ({passed.length})
              </p>
              <div className="mt-2 space-y-1.5">
                {passed.length > 0 ? (
                  passed.map((check) => (
                    <div key={check.id} className="rounded-lg border border-line bg-surface-input p-2.5">
                      <p className="text-[10px] text-ink">{check.label}</p>
                      <p className="mt-0.5 text-[9px] leading-4 text-ink-muted">{check.detail}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-ink-muted">No checks passed.</p>
                )}
              </div>
            </div>
            <div>
              <p className="label-mono flex items-center gap-1.5 text-[8px] text-crimson">
                <XCircle className="h-3 w-3" /> Failed ({failed.length})
              </p>
              <div className="mt-2 space-y-1.5">
                {failed.length > 0 ? (
                  failed.map((check) => (
                    <div key={check.id} className="rounded-lg border border-crimson/25 bg-crimson/5 p-2.5">
                      <p className="text-[10px] text-crimson">{check.label}</p>
                      <p className="mt-0.5 text-[9px] leading-4 text-ink-secondary">{check.detail}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-ink-muted">No failed checks.</p>
                )}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Required authority" description="What this outcome means for payment." />
            <div className="mt-3 space-y-2 text-[11px]">
              <div className="flex justify-between gap-2 border-b border-line-soft pb-2">
                <span className="text-ink-muted">User approval required</span>
                <span className={needsApproval ? "text-amber" : "text-ink"}>
                  {needsApproval ? "Yes — step-up pending" : "No"}
                </span>
              </div>
              <div className="flex justify-between gap-2 border-b border-line-soft pb-2">
                <span className="text-ink-muted">Mandate signed</span>
                <span className="mono-value text-ink">{decision.mandate.signature.slice(0, 22)}…</span>
              </div>
              <div className="flex justify-between gap-2 border-b border-line-soft pb-2">
                <span className="text-ink-muted">Proposal signed</span>
                <span className="mono-value text-ink">{decision.proposal.signature.slice(0, 22)}…</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-muted">Provider order</span>
                <span className="mono-value text-ink">
                  {decision.transaction?.paypalOrderId ?? "Not reached"}
                </span>
              </div>
            </div>
            {decision.transaction ? (
              <Link
                href={`/transactions/${decision.transaction.transactionId}`}
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-teal hover:underline"
              >
                <CreditCard className="h-3 w-3" /> Open full authorization trace →
              </Link>
            ) : (
              <p className="mt-3 rounded-lg border border-line bg-surface-input p-2.5 text-[9px] leading-4 text-ink-muted">
                No transaction was created. PACT stops before reserving budget or contacting PayPal
                when authorization fails.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Audit evidence"
              description="Hash-chained decisions and proposal events."
              action={<Badge tone="teal">{auditEvents.length}</Badge>}
            />
            <div className="mt-3 space-y-2">
              {auditEvents.length > 0 ? (
                auditEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/audit?eventId=${encodeURIComponent(event.eventId)}`}
                    className="block rounded-lg border border-line bg-surface-input p-2.5 text-[10px] text-ink-secondary transition-colors hover:border-teal/30"
                  >
                    <span className="mono-value block text-[8px] text-teal">{event.eventId}</span>
                    <span className="mt-0.5 block leading-4">{event.summary}</span>
                  </Link>
                ))
              ) : (
                <p className="text-[10px] text-ink-muted">No linked audit event found.</p>
              )}
            </div>
          </Card>

          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2 text-[9px] text-ink-muted">
            <Fingerprint className="h-3 w-3 text-teal" /> Decision latency {decision.decisionLatency}ms ·{" "}
            <ShieldCheck className="h-3 w-3 text-teal" /> deterministic checks
          </div>
        </div>
      </div>
    </div>
  );
}
