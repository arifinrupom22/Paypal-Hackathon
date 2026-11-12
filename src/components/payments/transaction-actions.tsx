"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, Receipt, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiClientError, apiFetch } from "@/lib/client/api";

export function TransactionActions({
  transactionId,
  status,
  paypalOrderId,
  failureCode,
}: {
  transactionId: string;
  status: string;
  paypalOrderId: string | null;
  failureCode?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function createOrder() {
    setPending("order");
    setError(null);
    try {
      const result = await apiFetch<{ approveUrl: string | null }>("/api/payments/create-order", {
        json: { transactionId },
      });
      if (result.approveUrl) {
        window.location.href = result.approveUrl;
        return;
      }
      throw new ApiClientError(
        "APPROVE_URL_MISSING",
        "PayPal created the order but returned no buyer approval link.",
        502,
      );
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "PayPal order creation failed.");
      setPending(null);
    }
  }

  async function capture() {
    setPending("capture");
    setError(null);
    try {
      await apiFetch(`/api/payments/${transactionId}/capture`, { json: {} });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Capture failed.");
    } finally {
      setPending(null);
    }
  }

  async function cancel() {
    setPending("cancel");
    setError(null);
    try {
      await apiFetch(`/api/payments/${transactionId}/cancel`, { json: {} });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Cancellation failed.");
    } finally {
      setPending(null);
    }
  }

  async function reconcile() {
    setPending("reconcile");
    setError(null);
    try {
      const result = await apiFetch<{ message: string }>(
        `/api/payments/${transactionId}/reconcile`,
        { json: {} },
      );
      setError(null);
      router.refresh();
      if (result.message.includes("no completed capture")) setError(result.message);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "PayPal reconciliation failed.");
    } finally {
      setPending(null);
    }
  }

  const payable = status === "POLICY_APPROVED";
  const capturable =
    Boolean(paypalOrderId) &&
    (status === "AWAITING_BUYER_APPROVAL" ||
      (status === "CAPTURING" && failureCode === "CAPTURE_UNCONFIRMED"));
  const cancellable =
    !paypalOrderId &&
    (status === "POLICY_APPROVED" || status === "AWAITING_BUYER_APPROVAL");
  const reconcilable =
    Boolean(paypalOrderId) &&
    (status === "AWAITING_BUYER_APPROVAL" ||
      (status === "CAPTURING" &&
        ["CAPTURE_UNCONFIRMED", "CAPTURE_MISMATCH_RECONCILIATION_REQUIRED"].includes(failureCode ?? "")));

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {payable ? (
          <Button variant="primary" size="sm" onClick={createOrder} disabled={pending !== null}>
            {pending === "order" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3 w-3" />}
            PayPal checkout
          </Button>
        ) : null}
        {capturable ? (
          <Button variant="secondary" size="sm" onClick={capture} disabled={pending !== null}>
            {pending === "capture" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Receipt className="h-3 w-3" />}
            Capture
          </Button>
        ) : null}
        {reconcilable ? (
          <Button variant="ghost" size="sm" onClick={reconcile} disabled={pending !== null}>
            {pending === "reconcile" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Reconcile
          </Button>
        ) : null}
        {cancellable ? (
          <Button variant="ghost" size="sm" onClick={cancel} disabled={pending !== null}>
            {pending === "cancel" ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            Release
          </Button>
        ) : null}
      </div>
      {error ? <p className="max-w-[260px] text-right text-[10px] leading-4 text-crimson">{error}</p> : null}
    </div>
  );
}
