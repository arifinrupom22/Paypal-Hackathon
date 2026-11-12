"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/empty-state";
import { ApiClientError, apiFetch } from "@/lib/client/api";

export function SessionControls() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function revokeAll() {
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/auth/logout-all", { json: {} });
      router.push("/login");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Could not revoke sessions.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button variant="destructive" onClick={revokeAll} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        Revoke all sessions
      </Button>
      <p className="text-[10px] leading-4 text-ink-muted">
        Invalidates every server-side session token for this account, including this browser.
      </p>
    </div>
  );
}
