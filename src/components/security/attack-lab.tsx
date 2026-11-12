"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Play,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/ui/empty-state";
import { ApiClientError, apiFetch } from "@/lib/client/api";
import { cn, formatDateTime, formatTime } from "@/lib/utils";

interface Scenario {
  id: string;
  title: string;
  threatClass: string;
  description: string;
}

interface Check {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

interface Run {
  id: string;
  runId: string;
  scenario: string;
  title: string;
  threatClass: string;
  description?: string;
  status: string;
  outcome: string;
  checks: Check[];
  response: Record<string, unknown>;
  durationMs: number;
  executedAt: string;
  decisionId: string | null;
  auditEventId?: string | null;
}

function statusTone(status: string) {
  if (status === "BOUNDARY_HELD") return "emerald" as const;
  if (status === "BOUNDARY_FAILED") return "crimson" as const;
  if (status === "ERROR") return "amber" as const;
  return "slate" as const;
}

export function AttackLab({
  scenarios,
  initialRuns,
}: {
  scenarios: Scenario[];
  initialRuns: Run[];
}) {
  const router = useRouter();
  const [runs, setRuns] = React.useState<Run[]>(initialRuns);
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Run | null>(initialRuns[0] ?? null);

  React.useEffect(() => {
    setRuns(initialRuns);
    setSelected((current) => current ?? initialRuns[0] ?? null);
  }, [initialRuns]);

  async function execute(scenario: Scenario) {
    setPending(scenario.id);
    setError(null);
    try {
      const result = await apiFetch<{ run: Run }>("/api/attacks/run", {
        json: { scenario: scenario.id },
      });
      setRuns((current) => [result.run, ...current]);
      setSelected(result.run);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Scenario execution failed.");
    } finally {
      setPending(null);
    }
  }

  const latestByScenario = new Map<string, Run>();
  for (const run of runs) {
    if (!latestByScenario.has(run.scenario)) latestByScenario.set(run.scenario, run);
  }

  return (
    <div className="space-y-5">
      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {scenarios.map((scenario, index) => {
          const latest = latestByScenario.get(scenario.id);
          const held = latest?.status === "BOUNDARY_HELD";
          return (
            <div key={scenario.id} className="flex flex-col rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="label-mono text-[9px]">Scenario {String(index + 1).padStart(2, "0")}</span>
                {latest ? (
                  <Badge tone={statusTone(latest.status)}>{latest.status.replace("BOUNDARY_", "")}</Badge>
                ) : (
                  <Badge tone="slate">Not run</Badge>
                )}
              </div>
              <h3 className="mt-2 text-[14px] font-medium text-ink">{scenario.title}</h3>
              <p className="label-mono mt-1 text-[8px] text-ink-muted">{scenario.threatClass}</p>
              <p className="mt-2 flex-1 text-[11px] leading-4 text-ink-secondary">{scenario.description}</p>
              {latest ? (
                <div className="mt-3 rounded-lg border border-line bg-surface-input px-2.5 py-2">
                  <p className="mono-value text-[10px] text-ink">
                    {latest.outcome}
                  </p>
                  <p className="mono-value mt-0.5 text-[9px] text-ink-muted">
                    {latest.durationMs}ms · {formatTime(latest.executedAt)}
                  </p>
                </div>
              ) : null}
              <Button
                variant={held ? "secondary" : "primary"}
                size="sm"
                className="mt-3 w-full"
                onClick={() => execute(scenario)}
                disabled={pending !== null}
              >
                {pending === scenario.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Execute against live engine
              </Button>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-medium text-ink">Execution records</h2>
              <p className="text-[11px] text-ink-muted">
                Every run is a real policy evaluation against the Postgres-backed engine.
              </p>
            </div>
            <Badge tone="teal">{runs.length} runs</Badge>
          </div>
          {runs.length > 0 ? (
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-[11px]">
                <thead className="table-head sticky top-0">
                  <tr>
                    <th className="px-5 py-2 font-medium">Executed</th>
                    <th className="px-3 py-2 font-medium">Scenario</th>
                    <th className="px-3 py-2 font-medium">Outcome</th>
                    <th className="px-3 py-2 font-medium">Checks</th>
                    <th className="px-3 py-2 font-medium">Latency</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const passed = run.checks.filter((check) => check.passed).length;
                    return (
                      <tr
                        key={run.id}
                        className={cn(
                          "cursor-pointer border-b border-line-soft/70 last:border-0",
                          selected?.id === run.id ? "bg-surface-raised" : "hover:bg-surface-raised/60",
                        )}
                        onClick={() => setSelected(run)}
                      >
                        <td className="mono-value px-5 py-2.5 text-ink-muted">{formatDateTime(run.executedAt)}</td>
                        <td className="px-3 py-2.5">
                          <span className="text-ink">{run.title}</span>
                          <span className="mono-value block text-[9px] text-ink-muted">{run.threatClass}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={statusTone(run.status)}>{run.status.replace("BOUNDARY_", "")}</Badge>
                          <span className="mono-value mt-1 block text-[9px] text-ink-secondary">{run.outcome}</span>
                        </td>
                        <td className="mono-value px-3 py-2.5 text-ink-secondary">
                          {passed}/{run.checks.length}
                        </td>
                        <td className="mono-value px-3 py-2.5 text-ink-muted">{run.durationMs}ms</td>
                        <td className="px-3 py-2.5 text-ink-muted">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                icon={<ShieldAlert className="h-4 w-4" />}
                title="No scenarios executed"
                description="Run a scenario above. PACT creates real harness agents and mandates, submits a proposal and records the engine's actual decision."
              />
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-medium text-ink">Decision inspector</h2>
            <p className="text-[11px] text-ink-muted">
              {selected ? selected.title : "Select a run to inspect returned checks."}
            </p>
          </div>

          {selected ? (
            <div className="max-h-[620px] space-y-4 overflow-auto p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
                <Badge tone="slate">{selected.outcome}</Badge>
                <span className="mono-value text-[9px] text-ink-muted">{selected.runId}</span>
                {selected.auditEventId ? (
                  <a
                    href={`/audit?eventId=${encodeURIComponent(selected.auditEventId)}`}
                    className="ml-auto text-[10px] text-teal hover:underline"
                  >
                    Open audit evidence →
                  </a>
                ) : null}
              </div>

              {selected.checks.length > 0 ? (
                <div className="space-y-2">
                  {selected.checks.map((check) => (
                    <div
                      key={check.id}
                      className={cn(
                        "rounded-lg border p-2.5",
                        check.passed
                          ? "border-line bg-surface-input"
                          : "border-crimson/25 bg-crimson/5",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {check.passed ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
                        ) : (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crimson" />
                        )}
                        <div className="min-w-0">
                          <p className="text-[11px] text-ink">{check.label}</p>
                          <p className="mt-0.5 text-[10px] leading-4 text-ink-muted">{check.detail}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-ink-muted">
                  No check detail was returned for this run.
                </p>
              )}

              <div className="rounded-lg border border-line bg-surface-input p-3">
                <p className="label-mono text-[8px]">Attack input + engine response</p>
                <p className="mt-1 text-[9px] leading-4 text-ink-muted">
                  Actual manipulated parameters returned by this run, not sample data.
                </p>
                <pre className="mt-1 max-h-[220px] overflow-auto font-mono text-[10px] leading-4 text-ink-secondary">
                  {JSON.stringify(selected.response, null, 2)}
                </pre>
              </div>

              <div className="flex items-center gap-2 text-[10px] text-ink-muted">
                <Activity className="h-3 w-3" />
                Decision {selected.decisionId ?? "aggregated across parallel evaluations"} ·{" "}
                {selected.durationMs}ms
              </div>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                icon={<AlertTriangle className="h-4 w-4" />}
                title="Nothing selected"
                description="Execute a scenario or select a record to review which checks passed and failed."
              />
            </div>
          )}
        </div>
      </div>

      <Notice tone="info" title="What these results mean">
        A held boundary means the deterministic policy engine refused authorization despite a
        manipulated or invalid proposal. PACT does not claim prompt injection can be eliminated; it
        guarantees that model text alone cannot grant payment authority.
      </Notice>
    </div>
  );
}

export function AttackSummary({ runs }: { runs: Run[] }) {
  const held = runs.filter((run) => run.status === "BOUNDARY_HELD").length;
  const failed = runs.filter((run) => run.status === "BOUNDARY_FAILED").length;
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px]">
      <span className="flex items-center gap-1.5 text-emerald">
        <ShieldCheck className="h-3.5 w-3.5" /> {held} boundaries held
      </span>
      <span className="flex items-center gap-1.5 text-crimson">
        <ShieldAlert className="h-3.5 w-3.5" /> {failed} boundary failures
      </span>
    </div>
  );
}
