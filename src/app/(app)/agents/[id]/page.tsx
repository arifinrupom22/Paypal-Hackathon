import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, Fingerprint, GitBranch, KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { getAgentDetail } from "@/lib/services/agents";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/ui/copy-button";
import { ProgressBar } from "@/components/ui/progress";
import { AgentStateButton } from "@/components/agents/agent-controls";
import { formatCurrency } from "@/lib/money";
import { formatDateTime, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const detail = await getAgentDetail(auth.userId, id);
  if (!detail) notFound();

  const { agent } = detail;
  const totalCapacity = agent.mandates.reduce((sum, mandate) => sum + Number(mandate.maxTotal), 0);
  const totalSpend = Array.from(detail.spendMap.values()).reduce(
    (sum, entry) => sum + Number(entry.amount),
    0,
  );
  const utilisation = totalCapacity > 0 ? (totalSpend / totalCapacity) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/agents" className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink">
            <ArrowLeft className="h-3 w-3" /> Agent Control Center
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={agent.status} />
            <Badge tone="teal">{agent.tier} identity</Badge>
            <span className="mono-value text-[10px] text-ink-muted">{agent.id}</span>
          </div>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.025em] text-ink">{agent.name}</h1>
          <p className="mt-1 max-w-2xl text-[12px] leading-5 text-ink-secondary">
            {agent.description ?? "No purpose recorded for this identity."}
          </p>
        </div>
        <AgentStateButton agentId={agent.id} status={agent.status} />
      </div>

      {agent.status !== "ACTIVE" ? (
        <Notice tone="warning" title="Agent suspended">
          The policy engine rejects every proposal presented by a suspended agent, regardless of
          mandate signature validity.
        </Notice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Identity & cryptographic material"
              description="Only the public half is exposed. The private key is AES-256-GCM encrypted with a key derived from AUTH_SECRET."
            />
            <div className="mt-4 space-y-3 text-[11px]">
              <div>
                <p className="label-mono text-[8px]">Ed25519 public key (SPKI, base64)</p>
                <div className="mt-1 flex items-start gap-2 rounded-lg border border-line bg-surface-input p-2.5">
                  <span className="mono-value min-w-0 flex-1 break-all text-[10px] leading-4 text-ink-secondary">
                    {agent.publicKey}
                  </span>
                  <CopyButton value={agent.publicKey} label="Copy" />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-surface-input p-2.5">
                  <p className="label-mono text-[8px]">Key fingerprint</p>
                  <p className="mono-value mt-1 truncate text-ink">{agent.keyFingerprint}</p>
                </div>
                <div className="rounded-lg border border-line bg-surface-input p-2.5">
                  <p className="label-mono text-[8px]">Registered</p>
                  <p className="mono-value mt-1 text-ink">{formatDateTime(agent.createdAt)}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-0">
            <div className="p-5 pb-3">
              <CardHeader
                title="Assigned mandates"
                description="Signed authority currently bound to this agent."
                action={<span className="pill border-line bg-surface-input text-ink-muted">{agent.mandates.length} total</span>}
              />
            </div>
            {agent.mandates.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[12px]">
                  <thead className="table-head">
                    <tr>
                      <th className="px-5 py-2 font-medium">Mandate</th>
                      <th className="px-3 py-2 font-medium">Scope</th>
                      <th className="px-3 py-2 text-right font-medium">Ceiling</th>
                      <th className="px-3 py-2 font-medium">Utilisation</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agent.mandates.map((mandate) => {
                      const spend = detail.spendMap.get(mandate.id);
                      const used = Number(mandate.maxTotal) > 0 ? (Number(spend?.amount ?? 0) / Number(mandate.maxTotal)) * 100 : 0;
                      return (
                        <tr key={mandate.id} className="border-b border-line-soft/70 last:border-0">
                          <td className="px-5 py-3">
                            <Link href={`/mandates/${mandate.mandateId}`} className="text-ink hover:text-teal">
                              {mandate.title}
                            </Link>
                            <span className="mono-value block text-[9px] text-ink-muted">{mandate.mandateId}</span>
                          </td>
                          <td className="px-3 py-3 text-[10px] text-ink-secondary">
                            {mandate.scopes.filter((scope) => scope.type === "CATEGORY").map((scope) => scope.value).join(", ")}
                          </td>
                          <td className="mono-value px-3 py-3 text-right text-ink">
                            {formatCurrency(mandate.maxTotal, mandate.currency)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="w-[120px]">
                              <ProgressBar value={used} tone={used > 90 ? "crimson" : used > 65 ? "amber" : "teal"} />
                              <p className="mono-value mt-1 text-[9px] text-ink-muted">
                                {formatCurrency(spend?.amount ?? 0, mandate.currency)}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-3"><StatusBadge status={mandate.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 pb-5">
                <EmptyState
                  icon={<ShieldAlert className="h-4 w-4" />}
                  title="No mandates assigned"
                  description="Create a signed mandate for this agent to grant bounded spending authority."
                  action={
                    <Link href="/mandates/new" className="text-[12px] text-teal hover:underline">
                      Create mandate →
                    </Link>
                  }
                />
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Activity history" description="Policy decisions and settled transactions for this identity." />
            {detail.transactions.length > 0 || detail.decisions.length > 0 ? (
              <div className="mt-4 space-y-2">
                {detail.transactions.slice(0, 6).map((transaction) => (
                  <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-input px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] text-ink">
                        {transaction.merchantName} · {formatCurrency(transaction.amount, transaction.currency)}
                      </p>
                      <p className="mono-value text-[9px] text-ink-muted">
                        {transaction.transactionId} · {transaction.mandate.mandateId}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={transaction.status} />
                      <span className="mono-value text-[9px] text-ink-muted">{formatDateTime(transaction.createdAt)}</span>
                    </div>
                  </div>
                ))}
                {detail.decisions.slice(0, 6).map((decision) => (
                  <div key={decision.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-input px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] text-ink-secondary">{decision.explanation}</p>
                      <p className="mono-value text-[9px] text-ink-muted">{decision.decisionId}</p>
                    </div>
                    <StatusBadge status={decision.outcome} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                className="mt-4 border-0 py-6"
                title="No activity recorded"
                description="Decisions and transactions appear here once this agent submits a proposal."
              />
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Authority envelope" description="Live aggregate across assigned mandates." />
            <div className="mt-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="label-mono text-[8px]">Total capacity</span>
                <span className="mono-value text-[16px] text-ink">{formatCurrency(totalCapacity, "USD")}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="label-mono text-[8px]">Reserved spend</span>
                <span className="mono-value text-[16px] text-ink">{formatCurrency(totalSpend, "USD")}</span>
              </div>
              <ProgressBar value={utilisation} tone={utilisation > 90 ? "crimson" : utilisation > 65 ? "amber" : "teal"} />
              <p className="label-mono text-[8px]">{utilisation.toFixed(1)}% utilised</p>
            </div>

            <div className="mt-4 space-y-2 border-t border-line-soft pt-3 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Parent agent</span>
                <span className="text-ink">
                  {agent.parentAgent ? (
                    <Link href={`/agents/${agent.parentAgent.id}`} className="text-teal hover:underline">
                      {agent.parentAgent.name}
                    </Link>
                  ) : (
                    "Sovereign root"
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Child agents</span>
                <span className="mono-value text-ink">{agent.children.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Last registered</span>
                <span className="mono-value text-ink">{relativeTime(agent.createdAt)}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Inheritance boundary" description="Sub-mandate permissions are checked against the parent at decision time." />
            <div className="mt-3 space-y-2">
              {[
                ["Budget", "Child ceiling ≤ parent remaining budget"],
                ["Expiry", "Child expiry ≤ parent expiry"],
                ["Scope", "Child merchants and categories ⊆ parent"],
                ["Lineage", "Delegated agent descends from parent agent"],
                ["Revocation", "Parent revocation invalidates all descendants"],
              ].map(([label, rule]) => (
                <div key={label} className="flex items-start gap-2 rounded-lg border border-line bg-surface-input px-2.5 py-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
                  <div>
                    <p className="text-[11px] text-ink">{label}</p>
                    <p className="text-[10px] leading-4 text-ink-muted">{rule}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Audit references" description="Hash-chained events for this identity." />
            <div className="mt-3 space-y-2">
              {detail.auditEvents.length > 0 ? (
                detail.auditEvents.map((event) => (
                  <div key={event.id} className="flex items-start justify-between gap-2 text-[10px]">
                    <span className="mono-value text-teal">{event.eventId}</span>
                    <span className="text-right text-ink-muted">{event.summary}</span>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-ink-muted">No audit references yet.</p>
              )}
            </div>
          </Card>

          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-input px-3 py-2 text-[10px] text-ink-muted">
            <KeyRound className="h-3 w-3 text-teal" />
            <Fingerprint className="h-3 w-3" />
            <span className="mono-value">Credential ciphertext never leaves the server.</span>
            <GitBranch className="ml-auto h-3 w-3" />
            <Bot className="h-3 w-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
