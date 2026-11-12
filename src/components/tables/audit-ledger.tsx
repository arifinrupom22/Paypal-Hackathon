"use client";

import * as React from "react";
import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
import { CheckCircle2, FileJson, Search, ShieldAlert, XCircle } from "lucide-react";
import { DataGrid } from "@/components/tables/grid";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";

export interface AuditRow {
  eventId: string;
  createdAt: string;
  actorLabel: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  summary: string;
  details: Record<string, unknown>;
  hash: string;
  prevHash: string | null;
  signature: string;
}

export function AuditLedger({
  events,
  chain,
  actionCounts,
  initialEventId,
}: {
  events: AuditRow[];
  chain: { valid: boolean; checked: number; brokenAt: string | null; signatureFailures: string[] };
  actionCounts: { action: string; count: number }[];
  initialEventId?: string;
}) {
  const [search, setSearch] = React.useState("");
  const [action, setAction] = React.useState("ALL");
  const [selected, setSelected] = React.useState<AuditRow | null>(
    () => events.find((event) => event.eventId === initialEventId) ?? events[0] ?? null,
  );

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      if (action !== "ALL" && event.action !== action) return false;
      if (!query) return true;
      return [
        event.eventId,
        event.actorLabel,
        event.summary,
        event.resourceId ?? "",
        event.action,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [events, search, action]);

  const columnDefs = React.useMemo<ColDef<AuditRow>[]>(
    () => [
      {
        field: "eventId",
        headerName: "Event ID",
        minWidth: 150,
        cellRenderer: (params: ICellRendererParams<AuditRow>) => (
          <span className="font-mono text-[10px] text-teal">{params.data?.eventId}</span>
        ),
      },
      {
        field: "createdAt",
        headerName: "Timestamp (UTC)",
        minWidth: 155,
        valueFormatter: (params) => (params.value ? formatDateTime(String(params.value)) : "—"),
      },
      {
        field: "actorLabel",
        headerName: "Actor",
        minWidth: 150,
        cellRenderer: (params: ICellRendererParams<AuditRow>) => (
          <div>
            <span className="text-[11px] text-ink">{params.data?.actorLabel}</span>
            <span className="mt-0.5 block font-mono text-[9px] text-ink-muted">{params.data?.actorType}</span>
          </div>
        ),
      },
      {
        field: "action",
        headerName: "Action",
        minWidth: 160,
        cellRenderer: (params: ICellRendererParams<AuditRow>) => (
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-secondary">
            {params.data?.action.replace(/_/g, " ")}
          </span>
        ),
      },
      { field: "summary", headerName: "Summary", minWidth: 260, flex: 2 },
      {
        field: "resourceId",
        headerName: "Target",
        minWidth: 140,
        cellRenderer: (params: ICellRendererParams<AuditRow>) => (
          <span className="font-mono text-[9px] text-ink-muted">{params.data?.resourceId ?? "—"}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          {chain.valid ? (
            <CheckCircle2 className="h-4 w-4 text-emerald" />
          ) : (
            <XCircle className="h-4 w-4 text-crimson" />
          )}
          <div>
            <p className="text-[12px] text-ink">
              {chain.valid ? "Hash chain intact" : "Chain verification failed"}
            </p>
            <p className="mono-value text-[9px] text-ink-muted">
              {chain.checked} records · {chain.signatureFailures.length} signature failures
              {chain.brokenAt ? ` · broken at ${chain.brokenAt}` : ""}
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search events, actors, resources…"
              className="field h-9 pl-9 text-[12px]"
              aria-label="Search audit events"
            />
          </div>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="field h-9 w-[190px] text-[12px]"
            aria-label="Filter by action"
          >
            <option value="ALL">All actions</option>
            {actionCounts.map((entry) => (
              <option key={entry.action} value={entry.action}>
                {entry.action.replace(/_/g, " ")} ({entry.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {events.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-[1.55fr_1fr]">
          <div className="ag-theme-quartz-dark pact-grid overflow-hidden rounded-xl border border-line" style={{ height: 560 }}>
            <DataGrid<AuditRow>
              rowData={filtered}
              columnDefs={columnDefs}
              defaultColDef={{ sortable: true, resizable: true, filter: true, flex: 1 }}
              pagination
              paginationPageSize={20}
              paginationPageSizeSelector={[20, 50, 100]}
              onRowClicked={(event: RowClickedEvent<AuditRow>) => event.data && setSelected(event.data)}
              rowHeight={52}
              overlayNoRowsTemplate="<span style='color:var(--color-ink-muted);font-size:12px'>No audit events match this filter.</span>"
            />
          </div>

          <div className="rounded-xl border border-line bg-surface">
            {selected ? (
              <>
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <div>
                    <p className="label-mono text-[8px]">Attestation inspector</p>
                    <p className="mono-value mt-0.5 text-[12px] text-teal">{selected.eventId}</p>
                  </div>
                  <Badge tone={chain.valid ? "teal" : "crimson"}>
                    {chain.valid ? "Chain valid" : "Unverified"}
                  </Badge>
                </div>
                <div className="max-h-[500px] space-y-3 overflow-auto p-4">
                  <div className="space-y-1.5 text-[10px]">
                    {[
                      ["Action", selected.action.replace(/_/g, " ")],
                      ["Actor", `${selected.actorLabel} (${selected.actorType})`],
                      ["Resource", `${selected.resourceType} · ${selected.resourceId ?? "—"}`],
                      ["Timestamp", formatDateTime(selected.createdAt)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-start justify-between gap-3">
                        <span className="text-ink-muted">{label}</span>
                        <span className="mono-value max-w-[62%] break-all text-right text-ink">{value}</span>
                      </div>
                    ))}
                  </div>

                  <p className="rounded-lg border border-line bg-surface-input p-2.5 text-[11px] leading-4 text-ink-secondary">
                    {selected.summary}
                  </p>

                  <div className="rounded-lg border border-line bg-surface-input">
                    <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5">
                      <span className="label-mono text-[8px]">Canonical payload</span>
                      <CopyButton value={JSON.stringify(selected.details, null, 2)} label="Copy JSON" />
                    </div>
                    <pre className="max-h-[180px] overflow-auto p-2.5 font-mono text-[9.5px] leading-4 text-ink-secondary">
                      {JSON.stringify(selected.details, null, 2)}
                    </pre>
                  </div>

                  <div className="space-y-1.5 rounded-lg border border-line bg-surface-input p-2.5">
                    <p className="label-mono text-[8px]">Chain linkage</p>
                    <p className="mono-value break-all text-[9px] text-ink-secondary">
                      hash {selected.hash}
                    </p>
                    <p className="mono-value break-all text-[9px] text-ink-muted">
                      prev {selected.prevHash ?? "GENESIS"}
                    </p>
                    <p className="mono-value break-all text-[9px] text-ink-muted">
                      sig {selected.signature.slice(0, 48)}…
                    </p>
                  </div>

                  <a
                    href={`/api/audit?eventId=${encodeURIComponent(selected.eventId)}`}
                    className="inline-flex items-center gap-1 text-[10px] text-teal hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileJson className="h-3 w-3" /> Export this record
                  </a>
                </div>
              </>
            ) : (
              <div className="p-5">
                <EmptyState
                  icon={<ShieldAlert className="h-4 w-4" />}
                  title="No record selected"
                  description="Select an audit event to inspect its canonical payload, hash and signature."
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-5">
          <EmptyState
            icon={<ShieldAlert className="h-4 w-4" />}
            title="Audit ledger is empty"
            description="Account creation is the first audited action. Mandate signing, agent registration, policy decisions and payments are appended here."
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-muted">
        <span>Showing {filtered.length} of {events.length} loaded events</span>
        <span className="mono-value">append-only writes · SHA-256 hash chain · Ed25519 record signatures</span>
      </div>
    </div>
  );
}
