import Link from "next/link";
import {
  Activity,
  Bot,
  CheckCircle2,
  CreditCard,
  Fingerprint,
  Lock,
  PlusCircle,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { getDashboardData } from "@/lib/services/analytics";
import { formatCurrency, formatMoney } from "@/lib/money";
import { MetricCard } from "@/components/dashboard/metric-card";
import { AuthorizationStreamChart, DecisionBarChart, CategoryPie } from "@/components/charts/dashboard-charts";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress";
import { getPayPalConfig } from "@/lib/paypal";
import { getGeminiStatus } from "@/lib/ai/status";
import { cn, formatTime, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RISK: Record<string, { label: string; tone: "crimson" | "amber" | "emerald" | "slate" }> = {
  POLICY_BLOCKED: { label: "High", tone: "crimson" },
  MANDATE_REVOKED: { label: "High", tone: "crimson" },
  AGENT_SUSPENDED: { label: "Medium", tone: "amber" },
  POLICY_APPROVAL_REQUIRED: { label: "Medium", tone: "amber" },
  PAYMENT_FAILED: { label: "Medium", tone: "amber" },
  SECURITY_TEST_EXECUTED: { label: "Low", tone: "emerald" },
};

export default async function DashboardPage() {
  const auth = await requirePageAuth();
  const data = await getDashboardData(auth.userId);
  const { metrics } = data;
  const paypal = getPayPalConfig();
  const gemini = getGeminiStatus();

  const utilization =
    Number(metrics.totalBudget) > 0
      ? Math.min(100, (Number(metrics.authorizedSpend) / Number(metrics.totalBudget)) * 100)
      : 0;

  const streamHasData = data.stream.some((point) => point.authorized + point.blocked + point.approval > 0);
  const dailyHasData = data.daily.some((point) => point.authorized + point.blocked + point.approval > 0);
  const categoryData = data.categories.map((entry) => ({
    category: entry.category,
    amount: Number(entry.amount),
    share: entry.share,
  }));
  const firstName = auth.user.name.split(" ")[0];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-xl border border-line bg-surface">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <span className="pill border-line bg-surface-input text-ink-muted">
                Institutional Vault Runtime
              </span>
              <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-[-0.03em] text-ink">
                Welcome back, {firstName}
              </h1>
              <p className="mt-2 max-w-2xl text-[13px] leading-5 text-ink-secondary">
                Real-time cryptographic authorization across {metrics.registeredAgents} registered
                agent{metrics.registeredAgents === 1 ? "" : "s"}. Every proposal is verified against
                signed mandate scope, live revocation state and reserved budget before PayPal is
                involved.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/agents" className={cn(buttonVariants({ variant: "secondary" }))}>
                <Bot className="h-4 w-4" />
                Register Agent
              </Link>
              <Link href="/mandates/new" className={cn(buttonVariants({ variant: "primary" }))}>
                <PlusCircle className="h-4 w-4" />
                Create Mandate
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line bg-canvas/50 px-4 py-3 text-[11px]">
            <span className="flex items-center gap-2 text-ink-secondary">
              <ShieldCheck className="h-3.5 w-3.5 text-teal" />
              Cryptography
              <span className="mono-value text-teal">Ed25519</span>
            </span>
            <span className="flex items-center gap-2 text-ink-secondary">
              <Lock className="h-3.5 w-3.5 text-teal" />
              Policy engine
              <span className="mono-value text-ink">deterministic</span>
            </span>
            <span className="flex items-center gap-2 text-ink-secondary">
              <CreditCard className={cn("h-3.5 w-3.5", paypal ? "text-teal" : "text-amber")} />
              PayPal
              <span className={cn("mono-value", paypal ? "text-teal" : "text-amber")}>
                {paypal ? `${paypal.environment} · connected` : "credentials required"}
              </span>
            </span>
            <span className="flex items-center gap-2 text-ink-secondary">
              <Activity className="h-3.5 w-3.5 text-ink-muted" />
              Intent parser
              <span className="mono-value text-ink">
                {gemini.configured ? gemini.model : "local fallback"}
              </span>
            </span>
            <span className="ml-auto flex items-center gap-2 text-ink-secondary">
              <Fingerprint className="h-3.5 w-3.5 text-ink-muted" />
              deterministic engine armed
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Active Mandates"
          value={String(metrics.activeMandates)}
          detail={`${metrics.revokedMandates} revoked · ${metrics.expiringSoon} expiring in 48h`}
          progress={{ value: utilization, label: `${utilization.toFixed(1)}% budget utilization` }}
          icon={ShieldCheck}
        />
        <MetricCard
          label="Registered Agents"
          value={String(metrics.registeredAgents)}
          detail="Ed25519 identities under owner control"
          icon={Bot}
        />
        <MetricCard
          label="Authorized Tx"
          value={String(metrics.authorizedTransactions)}
          detail={`${metrics.pendingApprovals} awaiting owner approval`}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Blocked Tx"
          value={String(metrics.blockedEvaluations)}
          detail="Rejected by the policy engine"
          icon={ShieldAlert}
          tone="crimson"
        />
        <MetricCard
          label="Authorized Spend"
          value={formatCurrency(metrics.authorizedSpend, "USD")}
          detail={`${formatCurrency(metrics.settledSpend, "USD")} captured via PayPal`}
          icon={Wallet}
          progress={{
            value: Number(metrics.totalBudget) > 0 ? (Number(metrics.remainingBudget) / Number(metrics.totalBudget)) * 100 : 0,
            label: `${formatCurrency(metrics.remainingBudget, "USD")} remaining`,
          }}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card className="min-h-[360px]">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                24h Authorization Stream
              </span>
            }
            description="Policy decisions evaluated in the last 24 hours."
            meta={
              <span className="flex items-center gap-3 text-[10px] text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-teal" /> Authorized
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-crimson" /> Blocked
                </span>
              </span>
            }
          />
          <div className="mt-4 h-[236px]">
            {streamHasData ? (
              <AuthorizationStreamChart data={data.stream} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  icon={<Activity className="h-4 w-4" />}
                  title="No authorization traffic yet"
                  description="Evaluations appear here the moment an agent proposal is submitted to the policy engine."
                  action={
                    <Link href="/payments" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
                      Open Payment Center
                    </Link>
                  }
                  className="w-full border-0"
                />
              </div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
            <div>
              <p className="label-mono text-[9px]">Authorized (24h)</p>
              <p className="mono-value mt-1 text-lg text-teal">
                {data.stream.reduce((sum, point) => sum + point.authorized, 0)}
              </p>
            </div>
            <div>
              <p className="label-mono text-[9px]">Blocked (24h)</p>
              <p className="mono-value mt-1 text-lg text-crimson">
                {data.stream.reduce((sum, point) => sum + point.blocked, 0)}
              </p>
            </div>
            <div>
              <p className="label-mono text-[9px]">Step-up holds</p>
              <p className="mono-value mt-1 text-lg text-amber">
                {data.stream.reduce((sum, point) => sum + point.approval, 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Allocated Spend Distribution"
            description="Settled and reserved exposure by category."
            action={<Badge tone="teal">Live ledger</Badge>}
          />
          {categoryData.length > 0 ? (
            <div className="mt-4 space-y-4">
              <div className="h-[150px]">
                <CategoryPie data={categoryData} />
              </div>
              {categoryData.map((entry, index) => (
                <div key={entry.category} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="flex min-w-0 items-center gap-2 text-ink">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: ["var(--color-teal)", "#0ea5a0", "var(--color-emerald)", "var(--color-amber)", "var(--color-violet)", "var(--color-crimson)"][index % 6] }}
                      />
                      <span className="truncate">{entry.category}</span>
                    </span>
                    <span className="mono-value shrink-0 text-ink-secondary">
                      {formatCurrency(entry.amount, "USD")}
                      <span className="ml-1.5 text-ink-muted">{entry.share}%</span>
                    </span>
                  </div>
                  <ProgressBar value={Number(entry.share)} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4 border-0 py-8"
              icon={<Wallet className="h-4 w-4" />}
              title="No spend recorded"
              description="Category exposure appears after PACT authorizes a transaction against a signed mandate."
            />
          )}
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card className="p-0">
          <div className="p-6 pb-4">
            <CardHeader
              title="Recent Cryptographic Interventions"
              description="Real-time policy evaluations, revocations and settlement failures."
              action={<Badge tone="teal">Hash-chained</Badge>}
            />
          </div>
          {data.securityEvents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead className="table-head">
                  <tr>
                    <th className="px-6 py-2 font-medium">Time (UTC)</th>
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Actor</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {data.securityEvents.map((event) => {
                    const risk = RISK[event.action] ?? { label: "Info", tone: "slate" as const };
                    return (
                      <tr key={event.id} className="border-b border-line-soft/70 text-[12px] last:border-0">
                        <td className="mono-value px-6 py-3 text-ink-muted">{formatTime(event.createdAt)}</td>
                        <td className="max-w-[280px] px-3 py-3">
                          <p className="truncate text-ink">{event.summary}</p>
                          <p className="mono-value mt-0.5 text-[10px] text-ink-muted">{event.eventId}</p>
                        </td>
                        <td className="px-3 py-3 text-ink-secondary">
                          <span className="block max-w-[160px] truncate">{event.actorLabel}</span>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={event.action.replace(/_/g, " ")} />
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={risk.tone}>{risk.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 pb-6">
              <EmptyState
                icon={<ShieldAlert className="h-4 w-4" />}
                title="No security events recorded"
                description="Blocked proposals, revocations and approval holds are appended to the audit chain as they occur."
                action={
                  <Link href="/security" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
                    Open Security Center
                  </Link>
                }
              />
            </div>
          )}
          <div className="flex items-center justify-between border-t border-line px-6 py-3 text-[11px] text-ink-muted">
            <span>Showing {data.securityEvents.length} of the latest recorded events</span>
            <Link href="/audit" className="text-teal hover:underline">
              View complete audit ledger →
            </Link>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                  Live Agent Telemetry
                </span>
              }
              description="Registered identities and their current execution state."
            />
            {data.agents.length > 0 ? (
              <div className="mt-4 divide-y divide-line-soft">
                {data.agents.slice(0, 5).map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[13px] text-ink">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            agent.status === "ACTIVE" ? "bg-teal" : "bg-crimson",
                          )}
                        />
                        <span className="truncate">{agent.name}</span>
                      </p>
                      <p className="mono-value mt-0.5 truncate text-[10px] text-ink-muted">
                        {agent.tier} · {agent.keyFingerprint.slice(0, 14)}…
                      </p>
                    </div>
                    <StatusBadge status={agent.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                className="mt-4 border-0 py-6"
                icon={<Bot className="h-4 w-4" />}
                title="No agents registered"
                description="Register an agent identity to start issuing signed mandates."
                action={
                  <Link href="/agents" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
                    Register agent
                  </Link>
                }
              />
            )}
          </Card>

          <Card>
            <CardHeader title="7-day Decision Mix" description="Authorized vs blocked vs step-up." />
            <div className="mt-4 h-[170px]">
              {dailyHasData ? (
                <DecisionBarChart data={data.daily} />
              ) : (
                <EmptyState
                  className="h-full border-0 py-4"
                  icon={<TrendingUp className="h-4 w-4" />}
                  title="No decisions this week"
                  description="Submit a proposal through the Payment Center to populate this chart."
                />
              )}
            </div>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-medium tracking-[-0.01em] text-ink">Active Mandates</h2>
            <p className="text-[12px] text-ink-secondary">
              Signed spending ceilings currently available to autonomous agents.
            </p>
          </div>
          <Link href="/mandates" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
            View Mandate Center
          </Link>
        </div>

        {data.mandates.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.mandates.map((mandate) => {
              const spend = data.spendMap.get(mandate.id);
              const spent = Number(spend?.spent ?? 0);
              const total = Number(mandate.maxTotal);
              const used = total > 0 ? (spent / total) * 100 : 0;
              return (
                <Link
                  key={mandate.id}
                  href={`/mandates/${mandate.mandateId}`}
                  className="group rounded-xl border border-line bg-surface p-4 transition-colors hover:border-teal/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={mandate.status} />
                    <span className="mono-value text-[9px] text-ink-muted">
                      {mandate.mandateId.slice(0, 14)}…
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-[36px] text-[13px] font-medium text-ink group-hover:text-teal">
                    {mandate.title}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-muted">{mandate.agent.name}</p>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="mono-value text-[15px] text-ink">
                      {formatCurrency(spent, mandate.currency)}
                    </span>
                    <span className="mono-value text-[10px] text-ink-muted">
                      of {formatCurrency(mandate.maxTotal, mandate.currency)}
                    </span>
                  </div>
                  <ProgressBar
                    className="mt-2"
                    value={used}
                    tone={used > 90 ? "crimson" : used > 65 ? "amber" : "teal"}
                  />
                  <p className="mono-value mt-2 text-[10px] text-ink-muted">
                    {spend?.count ?? 0}/{mandate.maxTransactions} tx · {relativeTime(mandate.expiresAt)}
                  </p>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<ShieldCheck className="h-4 w-4" />}
            title="No active mandates"
            description="Create a signed mandate to grant an agent bounded spending authority. Nothing can be authorized without one."
            action={
              <Link href="/mandates/new" className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
                <PlusCircle className="h-3.5 w-3.5" />
                Create mandate
              </Link>
            }
          />
        )}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface/60 px-4 py-3 text-[11px] text-ink-muted">
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-teal" />
          Total authorized capacity {formatCurrency(metrics.totalBudget, "USD")} · {formatMoney(metrics.remainingBudget)} {""}
          remaining
        </span>
        <span className="mono-value">
          {metrics.totalTransactions} settled or reserved transaction
          {metrics.totalTransactions === 1 ? "" : "s"}
        </span>
      </section>
    </div>
  );
}
