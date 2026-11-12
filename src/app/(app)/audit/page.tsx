import { FileCheck2, ShieldCheck } from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { verifyAuditChain } from "@/lib/audit";
import { AuditLedger, type AuditRow } from "@/components/tables/audit-ledger";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const auth = await requirePageAuth();
  const params = await searchParams;

  const [events, chain, actionCounts, total, latest] = await Promise.all([
    db.auditEvent.findMany({
      where: { ownerId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
    verifyAuditChain(auth.userId),
    db.auditEvent.groupBy({
      by: ["action"],
      where: { ownerId: auth.userId },
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
    }),
    db.auditEvent.count({ where: { ownerId: auth.userId } }),
    db.auditEvent.findFirst({ where: { ownerId: auth.userId }, orderBy: { createdAt: "desc" } }),
  ]);

  const rows: AuditRow[] = events.map((event) => ({
    eventId: event.eventId,
    createdAt: event.createdAt.toISOString(),
    actorLabel: event.actorLabel,
    actorType: event.actorType,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    summary: event.summary,
    details: (event.details ?? {}) as Record<string, unknown>,
    hash: event.hash,
    prevHash: event.prevHash,
    signature: event.signature,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="pill border-line bg-surface-input text-ink-muted">
            <FileCheck2 className="h-3 w-3 text-teal" />
            Attestation ledger
          </span>
          <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-ink">Audit &amp; Compliance</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-secondary">
            Hash-chained security and payment events with Ed25519 record signatures. Every sensitive
            operation appends an immutable-by-construction record; the chain is reverified on each
            page load.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="label-mono text-[8px]">Chain status</p>
          <div className="mt-1.5 flex items-center gap-2">
            <ShieldCheck className={chain.valid ? "h-4 w-4 text-teal" : "h-4 w-4 text-crimson"} />
            <span className="text-[13px] text-ink">
              {chain.valid ? "Verified" : "Verification failed"}
            </span>
          </div>
          <p className="mono-value mt-1 text-[9px] text-ink-muted">
            {chain.checked} linked records · {total} total
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Ledger height", value: String(total), detail: "append-only records" },
          { label: "Chain integrity", value: chain.valid ? "100%" : "BROKEN", detail: `${chain.signatureFailures.length} signature failures` },
          { label: "Record signatures", value: `${chain.checked - chain.signatureFailures.length}/${chain.checked}`, detail: "Ed25519 verified" },
          { label: "Latest event", value: latest ? latest.eventId : "—", detail: latest ? formatDateTime(latest.createdAt) : "no events" },
        ].map((stat) => (
          <Card key={stat.label} className="p-5">
            <p className="label-mono text-[9px]">{stat.label}</p>
            <p className="mono-value mt-2 truncate text-[20px] text-ink">{stat.value}</p>
            <p className="mt-1 text-[10px] text-ink-muted">{stat.detail}</p>
          </Card>
        ))}
      </div>

      <Card className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
        <span className="flex items-center gap-2 text-[11px] text-ink-secondary">
          <ShieldCheck className="h-3.5 w-3.5 text-teal" />
          Append-only application behaviour
        </span>
        <span className="text-[10px] text-ink-muted">
          Each record links to the previous hash under an owner row lock, so concurrent writers
          cannot fork the chain.
        </span>
        <Badge tone="amber" className="ml-auto">
          Not claimed tamper-proof at rest
        </Badge>
      </Card>

      <AuditLedger
        events={rows}
        chain={chain}
        initialEventId={params.eventId}
        actionCounts={actionCounts.map((entry) => ({ action: entry.action, count: entry._count._all }))}
      />
    </div>
  );
}
