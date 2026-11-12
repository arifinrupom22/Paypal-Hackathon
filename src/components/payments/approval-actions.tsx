"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiClientError, apiFetch } from "@/lib/client/api";

export function ApprovalActions({
  approvalId,
  proposalId,
}: {
  approvalId: string;
  proposalId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function decide(decision: "APPROVE" | "REJECT") {
    setPending(decision);
    setError(null);
    try {
      await apiFetch(`/api/approvals/${approvalId}`, { json: { decision } });
      if (decision === "APPROVE") {
        await apiFetch("/api/policy/evaluate", {
          json: {
            proposalId,
            executionId: `exec_${crypto.randomUUID()}`,
            idempotencyKey: `idem_${crypto.randomUUID()}`,
            approvalId,
          },
        });
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Approval action failed.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <Button variant="primary" size="sm" onClick={() => decide("APPROVE")} disabled={pending !== null}>
          {pending === "APPROVE" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Approve
        </Button>
        <Button variant="destructive" size="sm" onClick={() => decide("REJECT")} disabled={pending !== null}>
          {pending === "REJECT" ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          Reject
        </Button>
      </div>
      {error ? <p className="max-w-[220px] text-right text-[10px] text-crimson">{error}</p> : null}
    </div>
  );
}
