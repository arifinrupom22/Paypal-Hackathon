import Link from "next/link";
import { BarChart3, ShieldAlert, ShieldCheck } from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { listAttackRuns, SCENARIOS } from "@/lib/services/attacks";
import { AttackLab, AttackSummary } from "@/components/security/attack-lab";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const auth = await requirePageAuth();
  const rawRuns = await listAttackRuns(auth.userId, 50);
  const auditEvents = rawRuns.length
    ? await db.auditEvent.findMany({
        where: {
          ownerId: auth.userId,
          action: "SECURITY_TEST_EXECUTED",
          resourceId: { in: rawRuns.map((run) => run.runId) },
        },
        select: { eventId: true, resourceId: true },
      })
    : [];
  const auditByRun = new Map(auditEvents.map((event) => [event.resourceId, event.eventId]));

  const runs = rawRuns.map((run) => ({
    ...run,
    checks: (run.checks ?? []) as { id: string; label: string; passed: boolean; detail: string }[],
    response: (run.response ?? {}) as Record<string, unknown>,
    executedAt: run.executedAt.toISOString(),
    auditEventId: auditByRun.get(run.runId) ?? null,
  }));

  const scenarios = Object.entries(SCENARIOS).map(([id, meta]) => ({ id, ...meta }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="pill border-line bg-surface-input text-ink-muted">
            <ShieldAlert className="h-3 w-3 text-crimson" />
            Adversarial verification
          </span>
          <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-ink">Security Center</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-secondary">
            Eight executable attack scenarios run against the real authorization engine — creating
            harness agents, signing real mandates and submitting manipulated proposals. Results are
            recorded from actual decisions, never hardcoded.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="label-mono text-[8px]">Boundary integrity</p>
          <div className="mt-1.5">
            <AttackSummary runs={runs} />
          </div>
          <p className="mono-value mt-2 text-[10px] text-ink-muted">
            {runs.length} recorded executions
          </p>
          <Link
            href="/security/intelligence"
            className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-teal hover:underline"
          >
            <BarChart3 className="h-3 w-3" /> Security intelligence →
          </Link>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <span className="flex items-center gap-2 text-[11px] text-ink-secondary">
          <ShieldCheck className="h-3.5 w-3.5 text-teal" />
          Policy engine is the final authority
        </span>
        <span className="text-[11px] text-ink-muted">Signature → status → expiry → revocation → agent → merchant → category → amount → budget → count → replay → delegation → approval</span>
        <span className="pill ml-auto border-amber/30 bg-amber/5 text-amber">
          Harness data is isolated and labelled SECURITY_TEST
        </span>
      </Card>

      <AttackLab scenarios={scenarios} initialRuns={runs} />
    </div>
  );
}
