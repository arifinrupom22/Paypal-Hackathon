import Link from "next/link";
import { ArrowUpRight, Bot, GitBranch, KeyRound, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { listAgentsForOwner } from "@/lib/services/agents";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress";
import { RegisterAgentDialog, AgentStateButton } from "@/components/agents/agent-controls";
import { formatCurrency } from "@/lib/money";
import { cn, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const auth = await requirePageAuth();
  const agents = await listAgentsForOwner(auth.userId);

  const roots = agents.filter((entry) => entry.agent.tier === "ROOT");
  const children = agents.filter((entry) => entry.agent.tier === "CHILD");
  const suspended = agents.filter((entry) => entry.agent.status !== "ACTIVE");
  const totalBudget = agents.reduce((sum, entry) => sum + Number(entry.limits?.maxTotal ?? 0), 0);
  const totalSpend = agents.reduce((sum, entry) => sum + Number(entry.spend), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="pill border-line bg-surface-input text-ink-muted">
            <ShieldCheck className="h-3 w-3 text-teal" />
            Sovereign runtime enclave
          </span>
          <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-ink">
            Agent Control Center
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-secondary">
            Govern autonomous agents, define delegation boundaries and monitor real-time
            transaction capabilities. A child agent can never hold greater authority than its parent.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/agents/graph"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[11px] text-ink-secondary transition-colors hover:border-teal/40 hover:text-teal"
          >
            <GitBranch className="h-3.5 w-3.5" /> Delegation graph
          </Link>
          <RegisterAgentDialog roots={roots.map((entry) => ({ id: entry.agent.id, name: entry.agent.name }))} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Managed fleet", value: String(agents.length), detail: "Ed25519 identities", icon: Bot, tone: "text-ink" },
          { label: "Root agents", value: String(roots.length), detail: "Direct owner-bound identities", icon: ShieldCheck, tone: "text-teal" },
          { label: "Delegated children", value: String(children.length), detail: "Bounded by ancestor ceilings", icon: GitBranch, tone: "text-teal" },
          { label: "Suspended", value: String(suspended.length), detail: "Policy engine rejects all proposals", icon: ShieldAlert, tone: "text-crimson" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="p-5">
              <div className="flex items-start justify-between">
                <p className="label-mono text-[9px]">{stat.label}</p>
                <Icon className={cn("h-4 w-4", stat.tone)} />
              </div>
              <p className={cn("mono-value mt-3 text-[26px] leading-none", stat.tone)}>{stat.value}</p>
              <p className="mt-2 text-[11px] text-ink-muted">{stat.detail}</p>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="Hierarchical delegation topology"
          description="Deterministic rule: child agent spend ceilings and allowed categories can never exceed the parent's live authority."
          action={
            <div className="flex items-center gap-2">
              <Badge tone="teal">Ed25519 constrained</Badge>
              <span className="text-[10px] text-ink-muted">
                {formatCurrency(totalSpend, "USD")} of {formatCurrency(totalBudget, "USD")} allocated
              </span>
            </div>
          }
        />

        {agents.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_auto_1fr]">
            <div className="space-y-3">
              <p className="label-mono flex items-center gap-1.5 text-[8px]">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Level-0 sovereign root identities
              </p>
              {roots.length > 0 ? (
                roots.map((entry) => (
                  <Link
                    key={entry.agent.id}
                    href={`/agents/${entry.agent.id}`}
                    className="block rounded-lg border border-line bg-surface-input p-3 transition-colors hover:border-teal/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[13px] text-ink">
                        <span className={cn("h-1.5 w-1.5 rounded-full", entry.agent.status === "ACTIVE" ? "bg-teal" : "bg-crimson")} />
                        {entry.agent.name}
                      </span>
                      <Badge tone="teal">Root</Badge>
                    </div>
                    <p className="mono-value mt-1 text-[9px] text-ink-muted">
                      {entry.agent.id.slice(0, 10)} · {entry.activeMandates} active mandate
                      {entry.activeMandates === 1 ? "" : "s"}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-ink-muted">
                      <span>{formatCurrency(entry.limits?.maxTotal ?? 0, "USD")} authorized capacity</span>
                      <span>{entry.transactionCount} tx</span>
                    </div>
                    <ProgressBar
                      className="mt-1.5"
                      value={
                        Number(entry.limits?.maxTotal ?? 0) > 0
                          ? (Number(entry.spend) / Number(entry.limits?.maxTotal ?? 1)) * 100
                          : 0
                      }
                    />
                  </Link>
                ))
              ) : (
                <EmptyState
                  className="py-8"
                  icon={<Bot className="h-4 w-4" />}
                  title="No root agents"
                  description="Register a root identity to start issuing mandates."
                />
              )}
            </div>

            <div className="hidden flex-col items-center justify-center gap-2 lg:flex">
              <GitBranch className="h-5 w-5 text-ink-muted" />
              <span className="label-mono text-[8px]">Delegates</span>
            </div>

            <div className="space-y-2">
              <p className="label-mono flex items-center gap-1.5 text-[8px]">
                <span className="h-1.5 w-1.5 rounded-full bg-amber" /> Level-1 subordinate execution nodes
              </p>
              {children.length > 0 ? (
                children.map((entry) => {
                  const parent = agents.find((candidate) => candidate.agent.id === entry.agent.parentAgentId);
                  const utilisation =
                    Number(parent?.limits?.maxTotal ?? 0) > 0
                      ? (Number(entry.spend) / Number(parent!.limits!.maxTotal)) * 100
                      : 0;
                  return (
                    <Link
                      key={entry.agent.id}
                      href={`/agents/${entry.agent.id}`}
                      className="block rounded-lg border border-line bg-surface-input p-3 transition-colors hover:border-teal/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-[12px] text-ink">
                          <span className={cn("h-1.5 w-1.5 rounded-full", entry.agent.status === "ACTIVE" ? "bg-teal" : "bg-crimson")} />
                          {entry.agent.name}
                        </span>
                        <StatusBadge status={entry.agent.status} />
                      </div>
                      <p className="mono-value mt-1 text-[9px] text-ink-muted">
                        parent: {parent?.agent.name ?? "unknown"} · {entry.mandateCount} mandate
                        {entry.mandateCount === 1 ? "" : "s"}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-muted">
                        <span>{formatCurrency(entry.spend, "USD")} spent</span>
                        <span>{utilisation.toFixed(1)}% of parent capacity</span>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <p className="rounded-lg border border-dashed border-line p-4 text-[11px] text-ink-muted">
                  No delegated agents. Delegation creates a child identity whose mandates must fit
                  inside the parent&apos;s remaining budget and scope.
                </p>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            className="mt-5"
            icon={<Bot className="h-4 w-4" />}
            title="No agent identities registered"
            description="Register a root agent to receive a signed mandate. Without an agent identity nothing can be proposed."
            action={
              <RegisterAgentDialog roots={[]} triggerLabel="Register first agent" />
            }
          />
        )}
      </Card>

      <Card className="p-0">
        <div className="p-5 pb-3">
          <CardHeader
            title="Agent fleet registry"
            description="Real-time execution status and verified transaction limits."
            action={
              <span className="pill border-line bg-surface-input text-ink-muted">
                <Users className="h-3 w-3" /> {agents.length} identities
              </span>
            }
          />
        </div>
        {agents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[12px]">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-2 font-medium">Agent name &amp; ID</th>
                  <th className="px-3 py-2 font-medium">Parent origin</th>
                  <th className="px-3 py-2 font-medium">Scope</th>
                  <th className="px-3 py-2 font-medium">Limit utilisation</th>
                  <th className="px-3 py-2 font-medium">Txns</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((entry) => {
                  const total = Number(entry.limits?.maxTotal ?? 0);
                  const spent = Number(entry.spend);
                  const utilisation = total > 0 ? (spent / total) * 100 : 0;
                  return (
                    <tr key={entry.agent.id} className="border-b border-line-soft/70 last:border-0">
                      <td className="px-5 py-3">
                        <Link href={`/agents/${entry.agent.id}`} className="group flex items-center gap-2 text-ink group-hover:text-teal">
                          <span className={cn("h-1.5 w-1.5 rounded-full", entry.agent.status === "ACTIVE" ? "bg-teal" : "bg-crimson")} />
                          <span>
                            <span className="block">{entry.agent.name}</span>
                            <span className="mono-value block text-[9px] text-ink-muted">
                              {entry.agent.id.slice(0, 14)} · {entry.agent.tier}
                            </span>
                          </span>
                          <ArrowUpRight className="h-3 w-3 text-ink-muted" />
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-ink-secondary">{entry.parentName ?? "Sovereign root"}</td>
                      <td className="px-3 py-3 text-[11px] text-ink-secondary">
                        {entry.activeMandates} active / {entry.mandateCount} total
                      </td>
                      <td className="px-3 py-3">
                        <div className="w-[150px]">
                          <div className="mb-1 flex items-center justify-between text-[10px]">
                            <span className="mono-value text-ink">{formatCurrency(entry.spend, "USD")}</span>
                            <span className="mono-value text-ink-muted">{formatCurrency(entry.limits?.maxTotal ?? 0, "USD")}</span>
                          </div>
                          <ProgressBar value={utilisation} tone={utilisation > 90 ? "crimson" : utilisation > 65 ? "amber" : "teal"} />
                        </div>
                      </td>
                      <td className="mono-value px-3 py-3 text-ink-secondary">{entry.transactionCount}</td>
                      <td className="px-3 py-3"><StatusBadge status={entry.agent.status} /></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <AgentStateButton agentId={entry.agent.id} status={entry.agent.status} compact />
                          <Link href={`/agents/${entry.agent.id}`} className="text-ink-muted hover:text-teal" aria-label="Inspect agent">
                            <KeyRound className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                        <p className="mt-1 text-[9px] text-ink-muted">created {relativeTime(entry.agent.createdAt)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <EmptyState
              title="Registry empty"
              description="Register your first agent identity to see fleet telemetry, delegation boundaries and transaction limits."
              action={<RegisterAgentDialog roots={[]} />}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
