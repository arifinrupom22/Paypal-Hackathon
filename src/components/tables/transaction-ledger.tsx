"use client";

import * as React from "react";
import Link from "next/link";
import type { ColDef, ICellRendererParams, RowClickedEvent } from "ag-grid-community";
import { Download, FileJson, Search, X } from "lucide-react";
import { DataGrid } from "@/components/tables/grid";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatDateTime } from "@/lib/utils";

export interface LedgerRow {
  transactionId: string;
  createdAt: string;
  agentName: string;
  merchantName: string;
  amount: string;
  currency: string;
  mandateId: string;
  policyOutcome: string;
  paypalStatus: string;
  status: string;
  category: string;
  paypalCaptureId: string | null;
  paypalOrderId: string | null;
  executionId: string;
  idempotencyKey: string;
  auditRefs: string[];
  failureMessage: string | null;
  proposalId: string;
}

function StatusCell({ value }: ICellRendererParams<LedgerRow>) {
  return value ? <StatusBadge status={String(value)} /> : null;
}

function MonoCell({ value }: ICellRendererParams<LedgerRow>) {
  return (
    <span className="font-mono text-[10px] text-ink-secondary">{value ? String(value) : "—"}</span>
  );
}

export function TransactionLedger({ rows }: { rows: LedgerRow[] }) {
  const [search, setSearch] = React.useState("");
  const [policy, setPolicy] = React.useState("ALL");
  const [status, setStatus] = React.useState("ALL");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [selected, setSelected] = React.useState<LedgerRow | null>(null);

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (policy !== "ALL" && row.policyOutcome !== policy) return false;
      if (status !== "ALL" && row.status !== status) return false;
      if (from && new Date(row.createdAt) < new Date(`${from}T00:00:00Z`)) return false;
      if (to && new Date(row.createdAt) > new Date(`${to}T23:59:59Z`)) return false;
      if (!query) return true;
      return [
        row.transactionId,
        row.merchantName,
        row.agentName,
        row.mandateId,
        row.paypalCaptureId ?? "",
        row.category,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [rows, search, policy, status, from, to]);

  const columnDefs = React.useMemo<ColDef<LedgerRow>[]>(
    () => [
      {
        field: "transactionId",
        headerName: "Transaction ID",
        minWidth: 190,
        cellRenderer: (params: ICellRendererParams<LedgerRow>) => (
          <div className="py-1">
            <span className="font-mono text-[10px] text-teal">{params.data?.transactionId}</span>
            <span className="mt-0.5 block text-[9px] text-ink-muted">{params.data?.category}</span>
          </div>
        ),
      },
      {
        field: "createdAt",
        headerName: "Timestamp",
        minWidth: 150,
        valueFormatter: (params) => (params.value ? formatDateTime(String(params.value)) : "—"),
      },
      { field: "agentName", headerName: "Agent", minWidth: 140 },
      {
        field: "merchantName",
        headerName: "Merchant",
        minWidth: 160,
        cellRenderer: (params: ICellRendererParams<LedgerRow>) => (
          <div>
            <span className="text-[11px] text-ink">{params.data?.merchantName}</span>
            <span className="mt-0.5 block font-mono text-[9px] text-ink-muted">
              {params.data?.proposalId}
            </span>
          </div>
        ),
      },
      {
        field: "amount",
        headerName: "Amount",
        minWidth: 110,
        cellStyle: { textAlign: "right" },
        cellRenderer: (params: ICellRendererParams<LedgerRow>) => (
          <span className="font-mono text-[11px] text-ink">
            {params.data?.amount}{" "}
            <span className="text-[9px] text-ink-muted">{params.data?.currency}</span>
          </span>
        ),
      },
      { field: "mandateId", headerName: "Mandate", minWidth: 150, cellRenderer: MonoCell },
      { field: "policyOutcome", headerName: "Policy", minWidth: 120, cellRenderer: StatusCell },
      {
        field: "paypalStatus",
        headerName: "PayPal",
        minWidth: 100,
        cellRenderer: (params: ICellRendererParams<LedgerRow>) => (
          <span className="font-mono text-[10px] text-ink-secondary">
            {params.data?.paypalCaptureId ?? "—"}
          </span>
        ),
      },
      { field: "status", headerName: "Execution", minWidth: 130, cellRenderer: StatusCell },
    ],
    [],
  );

  function download(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const header = [
      "transaction_id",
      "timestamp_utc",
      "agent",
      "merchant",
      "amount",
      "currency",
      "mandate_id",
      "policy_outcome",
      "paypal_capture_id",
      "execution_status",
    ];
    const lines = filtered.map((row) =>
      [
        row.transactionId,
        new Date(row.createdAt).toISOString(),
        row.agentName,
        row.merchantName,
        row.amount,
        row.currency,
        row.mandateId,
        row.policyOutcome,
        row.paypalCaptureId ?? "",
        row.status,
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
    );
    download([header.join(","), ...lines].join("\n"), "pact-transactions.csv", "text/csv");
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter by transaction, merchant, agent or mandate…"
              className="field h-9 pl-9 text-[12px]"
              aria-label="Search transactions"
            />
          </div>
          <select value={policy} onChange={(event) => setPolicy(event.target.value)} className="field h-9 w-[150px] text-[12px]" aria-label="Policy outcome">
            <option value="ALL">All decisions</option>
            <option value="AUTHORIZED">Authorized</option>
            <option value="BLOCKED">Blocked</option>
            <option value="REQUIRES_USER_APPROVAL">Step-up</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="field h-9 w-[160px] text-[12px]" aria-label="Execution status">
            <option value="ALL">All executions</option>
            <option value="POLICY_APPROVED">Policy approved</option>
            <option value="AWAITING_BUYER_APPROVAL">Awaiting buyer</option>
            <option value="SETTLED">Settled</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUNDED">Refunded</option>
          </select>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="field h-9 w-[140px] text-[11px]" aria-label="From date" />
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="field h-9 w-[140px] text-[11px]" aria-label="To date" />
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              download(JSON.stringify(filtered, null, 2), "pact-transactions.json", "application/json")
            }
            disabled={filtered.length === 0}
          >
            <FileJson className="h-3.5 w-3.5" /> JSON
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-ink-muted">
          Showing {filtered.length} of {rows.length} ledger entries · all values originate from PostgreSQL
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="ag-theme-quartz-dark pact-grid overflow-hidden rounded-xl border border-line" style={{ height: 520 }}>
          <DataGrid<LedgerRow>
            rowData={filtered}
            columnDefs={columnDefs}
            defaultColDef={{ sortable: true, resizable: true, filter: true, flex: 1 }}
            pagination
            paginationPageSize={25}
            paginationPageSizeSelector={[10, 25, 50, 100]}
            onRowClicked={(event: RowClickedEvent<LedgerRow>) => event.data && setSelected(event.data)}
            rowHeight={52}
            suppressCellFocus={false}
            overlayNoRowsTemplate="<span style='color:var(--color-ink-muted);font-size:12px'>No transactions match the current filters.</span>"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-5">
          <EmptyState
            title="Ledger is empty"
            description="Authorized proposals create a ledger entry. Blocked proposals are recorded as policy decisions and audit events, never as transactions."
          />
        </div>
      )}

      {selected ? (
        <div className="rounded-xl border border-teal/25 bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div>
              <p className="label-mono text-[8px]">Cryptographic audit inspector</p>
              <p className="mono-value mt-0.5 text-[13px] text-teal">{selected.transactionId}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={selected.status} />
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded p-1 text-ink-muted hover:text-ink"
                aria-label="Close inspector"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <div className="space-y-2 text-[11px]">
              {[
                ["Merchant", selected.merchantName],
                ["Agent", selected.agentName],
                ["Mandate", selected.mandateId],
                ["Proposal", selected.proposalId],
                ["Amount", `${selected.amount} ${selected.currency}`],
                ["Policy outcome", selected.policyOutcome],
                ["PayPal order", selected.paypalOrderId ?? "—"],
                ["PayPal capture", selected.paypalCaptureId ?? "—"],
                ["Execution ID", selected.executionId],
                ["Idempotency key", selected.idempotencyKey],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-line-soft pb-1.5 last:border-0">
                  <span className="text-ink-muted">{label}</span>
                  <span className="mono-value max-w-[60%] break-all text-right text-ink">{value}</span>
                </div>
              ))}
              {selected.failureMessage ? (
                <p className="rounded border border-crimson/25 bg-crimson/5 p-2 text-[10px] text-crimson">
                  {selected.failureMessage}
                </p>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-line bg-surface-input p-3">
                <div className="flex items-center justify-between">
                  <p className="label-mono text-[8px]">Audit references</p>
                  <span className="mono-value text-[9px] text-ink-muted">{selected.auditRefs.length} events</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.auditRefs.length > 0 ? (
                    selected.auditRefs.map((ref) => (
                      <span key={ref} className="pill border-line bg-surface text-ink-secondary">{ref}</span>
                    ))
                  ) : (
                    <span className="text-[10px] text-ink-muted">See the audit ledger for this transaction.</span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-line bg-surface-input p-3">
                <div className="flex items-center justify-between">
                  <p className="label-mono text-[8px]">Settlement</p>
                  <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(JSON.stringify(selected, null, 2))}>
                    Copy JSON
                  </Button>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-ink-muted">
                  PACT authorization preceded any PayPal order. Capture is verified server-side
                  before status becomes SETTLED.
                </p>
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <span className="text-ink-muted">Created</span>
                  <span className="mono-value text-ink">{formatDateTime(selected.createdAt)}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/transactions/${selected.transactionId}`}
                  className={cn("inline-flex text-[11px] text-teal hover:underline")}
                >
                  Open full authorization trace →
                </Link>
                <Link
                  href={`/mandates/${selected.mandateId}`}
                  className={cn("inline-flex text-[11px] text-teal hover:underline")}
                >
                  Inspect mandate proof →
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
