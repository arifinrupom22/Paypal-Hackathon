"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { ApiClientError, apiFetch } from "@/lib/client/api";
import { formatCurrency } from "@/lib/money";

type State =
  | { kind: "idle" }
  | { kind: "capturing" }
  | { kind: "settled"; captureId: string; amount: string; currency: string }
  | { kind: "failed"; message: string };

export function PaymentReturn({ transactionId }: { transactionId: string | null }) {
  const [state, setState] = React.useState<State>({ kind: "idle" });
  const started = React.useRef(false);

  React.useEffect(() => {
    if (!transactionId || started.current) return;
    started.current = true;
    setState({ kind: "capturing" });
    apiFetch<{ captureId: string; capturedAmount: string; currency: string }>(
      `/api/payments/${transactionId}/capture`,
      { json: {} },
    )
      .then((result) =>
        setState({
          kind: "settled",
          captureId: result.captureId,
          amount: result.capturedAmount,
          currency: result.currency,
        }),
      )
      .catch((caught) =>
        setState({
          kind: "failed",
          message: caught instanceof ApiClientError ? caught.message : "Capture could not be confirmed.",
        }),
      );
  }, [transactionId]);

  if (!transactionId) {
    return (
      <div className="rounded-xl border border-crimson/30 bg-surface p-6">
        <p className="flex items-center gap-2 text-[14px] text-crimson">
          <AlertTriangle className="h-4 w-4" /> Missing transaction reference
        </p>
        <p className="mt-2 text-[12px] text-ink-secondary">
          PayPal returned without a transaction identifier. No capture was attempted.
        </p>
        <Link href="/payments" className="mt-4 inline-block text-[12px] text-teal hover:underline">
          Return to Payment Center
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      {state.kind === "capturing" ? (
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-teal" />
          <div>
            <p className="text-[14px] text-ink">Verifying PayPal capture…</p>
            <p className="mt-1 text-[12px] text-ink-secondary">
              PACT is calling the Orders v2 capture endpoint and will only record settlement when
              PayPal reports COMPLETED with a matching amount.
            </p>
          </div>
        </div>
      ) : null}

      {state.kind === "settled" ? (
        <div>
          <p className="flex items-center gap-2 text-[14px] text-emerald">
            <CheckCircle2 className="h-4 w-4" /> Payment captured and verified
          </p>
          <div className="mt-4 space-y-2 text-[12px]">
            <div className="flex items-center justify-between border-b border-line-soft pb-2">
              <span className="text-ink-muted">Transaction</span>
              <span className="mono-value text-ink">{transactionId}</span>
            </div>
            <div className="flex items-center justify-between border-b border-line-soft pb-2">
              <span className="text-ink-muted">PayPal capture ID</span>
              <span className="mono-value text-ink">{state.captureId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Captured amount</span>
              <span className="mono-value text-teal">{formatCurrency(state.amount, state.currency)}</span>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[10px] text-ink-muted">
            <ShieldCheck className="h-3 w-3 text-teal" />
            Settlement was recorded only after the PayPal capture confirmation.
          </p>
          <Link href="/transactions" className="mt-4 inline-block text-[12px] text-teal hover:underline">
            View in transaction ledger →
          </Link>
        </div>
      ) : null}

      {state.kind === "failed" ? (
        <div>
          <p className="flex items-center gap-2 text-[14px] text-crimson">
            <AlertTriangle className="h-4 w-4" /> Capture not confirmed
          </p>
          <p className="mt-2 text-[12px] leading-5 text-ink-secondary">{state.message}</p>
          <p className="mt-2 text-[10px] text-ink-muted">
            The transaction remains unsettled. Retry from the Payment Center once PayPal reports the
            buyer approval.
          </p>
          <Link href="/payments" className="mt-4 inline-block text-[12px] text-teal hover:underline">
            Return to Payment Center
          </Link>
        </div>
      ) : null}

      {state.kind === "idle" ? (
        <div>
          <p className="flex items-center gap-2 text-[13px] text-amber">
            <AlertTriangle className="h-4 w-4" /> Nothing to capture
          </p>
          <Link href="/payments" className="mt-3 inline-block text-[12px] text-teal hover:underline">
            Return to Payment Center
          </Link>
        </div>
      ) : null}
    </div>
  );
}
