import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Fingerprint,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { getSecurityIntelligence } from "@/lib/services/security-intelligence";
import { DecisionBarChart } from "@/components/charts/dashboard-charts";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SecurityIntelligencePage() {
  const auth = await requirePageAuth();
  const data = await getSecurityIntelligence(auth.userId);

  const maxViolation = Math.max(1, ...data.violationCategories.map((category) => category.count));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/security" className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink">
          <ArrowLeft className="h-3 w-3" /> Security Center
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-mono text-[8px]">Decision telemetry</p>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ink">
              Security Intelligence
            </h1>
            <p className="mt-1 max-w-2xl text-[12px] leading-5 text-ink-secondary">
              Counts and explanations are computed from persisted policy decisions and the
              hash-chained audit ledger. A zero means no matching event was recorded — not that a
              scenario was simulated.
            </p>
          </div>
          <span className="pill border-line bg-surface text-ink-muted">
            <SlidersHorizontal className="h-3 w-3" /> Last {data.days} days
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          { label: "Decisions", value: String(data.totalDecisions), detail: "policy evaluations", icon: Activity },
          { label: "Authorized", value: String(data.authorized), detail: "all checks passed", icon: ShieldCheck },
          { label: "Blocked / expired", value: String(data.blocked), detail: "hard boundary failures", icon: ShieldAlert },
          { label: "Step-up holds", value: String(data.stepUp), detail: "owner approval required", icon: AlertTriangle },
          { label: "Replay attempts", value: String(data.replayAttempts), detail: "consumed identifiers", icon: RefreshCcw },
          { label: "Boundary attempts", value: String(data.budgetAttempts + data.merchantAttempts), detail: `${data.budgetAttempts} budget · ${data.merchantAttempts} merchant`, icon: Fingerprint },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className="p-4">
              <div className="flex items-start justify-between">
                <p className="label-mono text-[8px]">{metric.label}</p>
                <Icon className="h-3.5 w-3.5 text-teal" />
              </div>
              <p className="mono-value mt-2 text-[24px] leading-none text-ink">{metric.value}</p>
              <p className="mt-1.5 text-[9px] text-ink-muted">{metric.detail}</p>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            title="Policy decision trend"
            description="Authorized, blocked and step-up decisions recorded per UTC day."
            action={<Badge tone="teal">{data.totalDecisions} observations</Badge>}
          />
          <div className="mt-4 h-[260px]">
            <DecisionBarChart data={data.trend} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Failure categories"
            description="Failed checks grouped by their boundary, not estimated severity."
            action={<Badge tone={data.violationCategories.length ? "crimson" : "slate"}>{data.violationCategories.length} categories</Badge>}
          />
          <div className="mt-4 space-y-3">
            {data.violationCategories.length > 0 ? (
              data.violationCategories.map((category) => (
                <div key={category.id}>
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="text-ink">{category.label}</span>
                    <span className="mono-value text-ink-muted">{category.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-input">
                    <div
                      className="h-full rounded-full bg-crimson/80"
                      style={{ width: `${Math.max(4, (category.count / maxViolation) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[9px] text-ink-muted">{category.detail}</p>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-line bg-surface-input p-3 text-[10px] leading-4 text-ink-muted">
                No failed policy checks were recorded in this window. Run an adversarial scenario to
                produce a real decision.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader
            title="Suspicious execution attempts"
            description="Non-authorized decisions with the engine's own explanation and failed checks."
            action={<Badge tone="amber">{data.suspicious.length} recent</Badge>}
          />
          {data.suspicious.length > 0 ? (
            <div className="mt-4 divide-y divide-line-soft">
              {data.suspicious.map((attempt) => (
                <div key={attempt.decisionId} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={attempt.outcome} />
                    <span className="mono-value text-[9px] text-ink-muted">
                      {formatDateTime(attempt.createdAt)}
                    </span>
                    <span className="ml-auto mono-value text-[10px] text-ink">
                      {formatCurrency(attempt.amount, attempt.currency)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-ink">
                    {attempt.merchant} · {attempt.agent}
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{attempt.explanation}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {attempt.failedChecks.slice(0, 4).map((check) => (
                      <span key={check} className="pill border-crimson/20 bg-crimson/5 text-crimson">
                        {check}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-3 text-[9px]">
                    <Link href={`/decisions/${attempt.decisionId}`} className="text-teal hover:underline">
                      Explain decision →
                    </Link>
                    <Link href={`/mandates/${attempt.mandateId}`} className="text-teal hover:underline">
                      Mandate {attempt.mandateId}
                    </Link>
                    {attempt.auditEventId ? (
                      <Link
                        href={`/audit?eventId=${encodeURIComponent(attempt.auditEventId)}`}
                        className="text-teal hover:underline"
                      >
                        Open audit event →
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                icon={<ShieldCheck className="h-4 w-4" />}
                title="No suspicious attempts recorded"
                description="Every policy evaluation in this window was authorized or is awaiting owner action. Execute a scenario in the Security Center to generate real adversarial evidence."
              />
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Revocation events"
              description="Owner-issued revocations from the audit chain."
              action={<Badge tone={data.revocationCount ? "crimson" : "slate"}>{data.revocationCount}</Badge>}
            />
            {data.revocations.length > 0 ? (
              <div className="mt-3 space-y-2">
                {data.revocations.map((event) => (
                  <Link
                    key={event.eventId}
                    href={`/audit?eventId=${encodeURIComponent(event.eventId)}`}
                    className="block rounded-lg border border-line bg-surface-input p-2.5 transition-colors hover:border-crimson/30"
                  >
                    <p className="text-[10px] leading-4 text-ink-secondary">{event.summary}</p>
                    <p className="mono-value mt-1 text-[8px] text-ink-muted">
                      {event.eventId} · {formatDateTime(event.createdAt)}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[10px] leading-4 text-ink-muted">
                No mandate revocations were recorded in this window.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Evidence mix" description="What this window is based on." />
            <div className="mt-3 space-y-2 text-[10px]">
              <div className="flex justify-between gap-2">
                <span className="text-ink-muted">Adversarial runs</span>
                <span className="mono-value text-ink">{data.attackRuns}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-muted">Policy decisions</span>
                <span className="mono-value text-ink">{data.totalDecisions}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-muted">Revocation audit records</span>
                <span className="mono-value text-ink">{data.revocationCount}</span>
              </div>
              <p className="border-t border-line pt-2 text-[9px] leading-4 text-ink-muted">
                Simulations and fixtures are not counted. Security scenario harnesses are labelled
                SECURITY_TEST and remain isolated by owner.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
