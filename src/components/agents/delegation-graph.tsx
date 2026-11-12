"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronRight, GitBranch, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface GraphScope {
  type: "MERCHANT" | "CATEGORY";
  value: string;
}

export interface GraphMandate {
  id: string;
  mandateId: string;
  title: string;
  status: string;
  currency: string;
  maxTotal: string;
  maxPerTransaction: string;
  spent: string;
  expiresAt: string;
  delegationAllowed: boolean;
  parentMandateId: string | null;
  revokedAt: string | null;
  scopes: GraphScope[];
}

export interface GraphAgent {
  id: string;
  name: string;
  tier: string;
  status: string;
  parentAgentId: string | null;
  parentName: string | null;
  keyFingerprint: string;
  createdAt: string;
  mandates: GraphMandate[];
}

function effectiveStatus(mandate: GraphMandate): string {
  if (mandate.status === "REVOKED" || mandate.revokedAt) return "REVOKED";
  if (new Date(mandate.expiresAt).getTime() <= Date.now()) return "EXPIRED";
  return mandate.status;
}

function capacity(agent: GraphAgent): number {
  return agent.mandates
    .filter((mandate) => effectiveStatus(mandate) === "ACTIVE")
    .reduce((sum, mandate) => sum + Number(mandate.maxTotal), 0);
}

export function DelegationGraph({ agents }: { agents: GraphAgent[] }) {
  const [selectedId, setSelectedId] = React.useState(agents[0]?.id ?? null);
  const selected = agents.find((agent) => agent.id === selectedId) ?? null;
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const children = new Map<string, GraphAgent[]>();
  for (const agent of agents) {
    if (!agent.parentAgentId) continue;
    const list = children.get(agent.parentAgentId) ?? [];
    list.push(agent);
    children.set(agent.parentAgentId, list);
  }
  const roots = agents.filter((agent) => !agent.parentAgentId);
  const links = agents.filter((agent) => Boolean(agent.parentAgentId)).length;

  const parent = selected?.parentAgentId ? agentsById.get(selected.parentAgentId) : null;
  const parentMandates = parent?.mandates ?? [];
  const authorityChecks = selected
    ? selected.mandates
        .filter((mandate) => mandate.parentMandateId)
        .map((mandate) => {
          const parentMandate = parentMandates.find((candidate) => candidate.id === mandate.parentMandateId);
          if (!parentMandate) {
            return { mandate, parentMandate: null, checks: [] as { label: string; pass: boolean; detail: string }[] };
          }
          const parentScopes = new Set(
            parentMandate.scopes.map((scope) => `${scope.type}:${scope.value.toLowerCase()}`),
          );
          const outside = mandate.scopes.filter(
            (scope) => !parentScopes.has(`${scope.type}:${scope.value.toLowerCase()}`),
          );
          return {
            mandate,
            parentMandate,
            checks: [
              {
                label: "Parent authority active",
                pass: effectiveStatus(parentMandate) === "ACTIVE",
                detail: `${parentMandate.mandateId} is ${effectiveStatus(parentMandate)}`,
              },
              {
                label: "Child authority active",
                pass: effectiveStatus(mandate) === "ACTIVE",
                detail: `${mandate.mandateId} is ${effectiveStatus(mandate)}`,
              },
              {
                label: "Budget containment",
                pass: Number(mandate.maxTotal) <= Number(parentMandate.maxTotal),
                detail: `${mandate.maxTotal} ≤ ${parentMandate.maxTotal} ${parentMandate.currency}`,
              },
              {
                label: "Expiry containment",
                pass: new Date(mandate.expiresAt) <= new Date(parentMandate.expiresAt),
                detail: `${mandate.expiresAt.slice(0, 10)} ≤ ${parentMandate.expiresAt.slice(0, 10)}`,
              },
              {
                label: "Permission subset",
                pass: outside.length === 0,
                detail: outside.length === 0 ? "All scopes inherited from parent" : `Exceeds: ${outside.map((scope) => scope.value).join(", ")}`,
              },
              {
                label: "Delegation enabled",
                pass: parentMandate.delegationAllowed,
                detail: parentMandate.delegationAllowed ? "Parent permits delegation" : "Parent forbids delegation",
              },
              {
                label: "Currency match",
                pass: mandate.currency === parentMandate.currency,
                detail: `${mandate.currency} / ${parentMandate.currency}`,
              },
            ],
          };
        })
    : [];
  const contained =
    authorityChecks.length > 0 && authorityChecks.every((entry) => entry.checks.every((check) => check.pass));
  const withdrawn =
    authorityChecks.length > 0 &&
    authorityChecks.every(
      (entry) =>
        effectiveStatus(entry.mandate) !== "ACTIVE" ||
        (entry.parentMandate !== null && effectiveStatus(entry.parentMandate) !== "ACTIVE"),
    );

  function renderTree(agent: GraphAgent, depth = 0): React.ReactNode {
    const descendants = children.get(agent.id) ?? [];
    const active = selectedId === agent.id;
    const mand = agent.mandates.filter((entry) => effectiveStatus(entry) === "ACTIVE");
    const spent = agent.mandates.reduce((sum, entry) => sum + Number(entry.spent), 0);
    return (
      <div key={agent.id} className={cn(depth > 0 && "relative ml-4 border-l border-line pl-3")}>
        {depth > 0 ? (
          <span className="absolute -left-3 top-5 h-px w-3 bg-line" aria-hidden="true" />
        ) : null}
        <button
          type="button"
          onClick={() => setSelectedId(agent.id)}
          aria-pressed={active}
          className={cn(
            "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
            active
              ? "border-teal/45 bg-teal/5"
              : "border-line bg-surface hover:border-line-strong hover:bg-surface-raised",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                  agent.status === "ACTIVE"
                    ? "border-teal/35 bg-teal/10 text-teal"
                    : "border-crimson/35 bg-crimson/10 text-crimson",
                )}
              >
                {agent.status === "ACTIVE" ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] text-ink">{agent.name}</span>
                <span className="mono-value block truncate text-[8px] text-ink-muted">
                  {agent.tier} · {agent.keyFingerprint.slice(0, 20)}…
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="mono-value text-[9px] text-ink-muted">
                {mand.length} active · {agent.mandates.length} signed
              </span>
              <ChevronRight className="h-3 w-3 text-ink-muted" />
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-ink-muted">
            <span>{spent.toFixed(2)} spent</span>
            <span>{capacity(agent).toFixed(2)} active ceiling</span>
            {children.get(agent.id)?.length ? <span>{children.get(agent.id)!.length} direct child</span> : null}
            {descendants.length === 0 ? <span>leaf</span> : null}
          </div>
        </button>
        {descendants.length > 0 ? (
          <div className="mt-1.5 space-y-1.5">{descendants.map((child) => renderTree(child, depth + 1))}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label-mono text-[8px]">Agent hierarchy</p>
            <h2 className="mt-1 text-[16px] text-ink">Delegation graph</h2>
            <p className="mt-1 text-[11px] leading-4 text-ink-muted">
              Parent agents extend authority to children. Select any node to compare the child&apos;s
              signed ceilings against the parent mandate.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge tone="teal">{agents.length} agents</Badge>
            <Badge tone="slate">{links} delegation{links === 1 ? "" : "s"}</Badge>
          </div>
        </div>
        {roots.length > 0 ? (
          <div className="mt-4 space-y-2">{roots.map((root) => renderTree(root))}</div>
        ) : (
          <div className="mt-6 rounded-lg border border-dashed border-line p-8 text-center">
            <GitBranch className="mx-auto h-5 w-5 text-ink-muted" />
            <p className="mt-2 text-[12px] text-ink">No registered agents yet.</p>
            <p className="mt-1 text-[10px] text-ink-muted">
              Register a root agent, then register a child against it.
            </p>
            <Link href="/agents" className="mt-3 inline-flex text-[11px] text-teal hover:underline">
              Open Agent Control Center →
            </Link>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="label-mono text-[8px]">Selected authority</p>
            <p className="truncate text-[14px] text-ink">{selected?.name ?? "No agent selected"}</p>
          </div>
          {selected?.parentName ? <Badge tone="violet">child of {selected.parentName}</Badge> : <Badge tone="teal">root</Badge>}
        </div>

        {selected ? (
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Agent status" value={selected.status} />
              <Metric label="Active ceiling" value={capacity(selected).toFixed(2)} />
              <Metric label="Agent tier" value={selected.tier} />
              <Metric
                label="Next expiry"
                value={
                  selected.mandates.length
                    ? new Date(
                        Math.min(...selected.mandates.map((mandate) => new Date(mandate.expiresAt).getTime())),
                      ).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                    : "—"
                }
              />
            </div>

            <div>
              <p className="label-mono text-[8px]">Signed mandates</p>
              <div className="mt-2 space-y-2">
                {selected.mandates.length > 0 ? (
                  selected.mandates.map((mandate) => {
                    const status = effectiveStatus(mandate);
                    return (
                      <div key={mandate.id} className="rounded-lg border border-line bg-surface-input p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] text-ink">{mandate.title}</p>
                          <Badge tone={status === "ACTIVE" ? "teal" : status === "REVOKED" ? "crimson" : "slate"}>
                            {status}
                          </Badge>
                        </div>
                        <p className="mono-value mt-1 text-[8px] text-ink-muted">{mandate.mandateId}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {mandate.scopes.map((scope) => (
                            <span key={`${mandate.id}-${scope.type}-${scope.value}`} className="pill border-line bg-surface text-ink-muted">
                              {scope.type === "MERCHANT" ? "merchant" : "category"} · {scope.value}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 flex justify-between text-[9px] text-ink-muted">
                          <span>spent {mandate.spent}</span>
                          <span>ceiling {mandate.maxTotal} {mandate.currency}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[10px] text-ink-muted">No mandates are signed for this agent.</p>
                )}
              </div>
            </div>

            {selected.parentAgentId ? (
              <div className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="label-mono text-[8px]">Delegated authority containment</p>
                  <Badge tone={contained ? "emerald" : withdrawn ? "crimson" : "amber"}>
                    {authorityChecks.length === 0 ? "unlinked" : contained ? "contained" : withdrawn ? "withdrawn" : "review"}
                  </Badge>
                </div>
                {withdrawn ? (
                  <p className="mt-2 rounded border border-crimson/25 bg-crimson/5 p-2 text-[9px] leading-4 text-crimson">
                    Authority is inactive through this mandate or an ancestor. The signature remains
                    valid evidence, but the policy engine will not authorize spending.
                  </p>
                ) : null}
                {authorityChecks.length > 0 ? (
                  <div className="mt-2 space-y-3">
                    {authorityChecks.map(({ mandate, checks }) => (
                      <div key={mandate.id}>
                        <p className="mono-value text-[8px] text-ink-muted">{mandate.mandateId}</p>
                        <div className="mt-1 space-y-1">
                          {checks.map((check) => (
                            <div key={check.label} className="flex items-start gap-1.5 text-[9px] leading-4">
                              {check.pass ? (
                                <Check className="mt-0.5 h-2.5 w-2.5 shrink-0 text-teal" />
                              ) : (
                                <X className="mt-0.5 h-2.5 w-2.5 shrink-0 text-crimson" />
                              )}
                              <span className="min-w-0">
                                <span className="text-ink-secondary">{check.label}: </span>
                                <span className={check.pass ? "text-ink-muted" : "text-crimson"}>{check.detail}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[10px] leading-4 text-ink-muted">
                    This child has no mandate linked to a parent mandate. The agent hierarchy exists,
                    but the budget and scope containment record is not present.
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-teal/20 bg-teal/5 p-3 text-[10px] leading-4 text-ink-secondary">
                <ShieldCheck className="mr-1 inline h-3 w-3 text-teal" />
                Root agents receive authority directly from the owner. They cannot inherit it from
                another agent.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Link href={`/agents/${selected.id}`} className="text-[10px] text-teal hover:underline">
                Open agent ledger →
              </Link>
              {selected.mandates[0] ? (
                <Link href={`/mandates/${selected.mandates[0].mandateId}`} className="text-[10px] text-teal hover:underline">
                  Inspect signed mandate →
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="p-4 text-[11px] text-ink-muted">Select an agent in the graph.</p>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-input px-3 py-2">
      <p className="label-mono text-[7px]">{label}</p>
      <p className="mono-value mt-1 truncate text-[11px] text-ink">{value}</p>
    </div>
  );
}
