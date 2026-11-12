"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Loader2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/empty-state";
import { ApiClientError, apiFetch } from "@/lib/client/api";
import { formatMoney } from "@/lib/money";
import { parseUtcInput } from "@/lib/utils";

export interface DelegateAgentOption {
  id: string;
  name: string;
  tier: string;
  parentAgentId: string | null;
}

export function MandateActions({
  id,
  mandateId,
  status,
  delegationAllowed,
  currency,
  maxTotal,
  spent,
  expiresAt,
  maxPerTransaction,
  maxTransactions,
  merchants,
  categories,
  agents,
  compact = false,
}: {
  id: string;
  mandateId: string;
  status: string;
  delegationAllowed: boolean;
  currency: string;
  maxTotal: string;
  spent: string;
  expiresAt: string;
  maxPerTransaction: string;
  maxTransactions: number;
  merchants: string[];
  categories: string[];
  agents: DelegateAgentOption[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [delegateOpen, setDelegateOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  const remaining = Math.max(0, Number(maxTotal) - Number(spent));
  const active = status === "ACTIVE";

  async function revoke() {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/mandates/${id}/revoke`, { json: { reason } });
      setRevokeOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Revocation failed.");
    } finally {
      setPending(false);
    }
  }

  async function delegate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch(`/api/mandates/${id}/delegate`, {
        json: {
          agentId: String(form.get("agentId") ?? ""),
          title: String(form.get("title") ?? ""),
          maxTotal: String(form.get("maxTotal") ?? ""),
          maxPerTransaction: String(form.get("maxPerTransaction") ?? ""),
          maxTransactions: Number(form.get("maxTransactions") ?? 1),
          expiresAt: parseUtcInput(String(form.get("expiresAt"))).toISOString(),
          merchants: String(form.get("merchants") ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          categories: String(form.get("categories") ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        },
      });
      setDelegateOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Delegation failed.");
    } finally {
      setPending(false);
    }
  }

  const defaultExpiry = new Date(Math.min(new Date(expiresAt).getTime(), Date.now() + 24 * 3600_000))
    .toISOString()
    .slice(0, 16);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog open={delegateOpen} onOpenChange={(value) => { setDelegateOpen(value); setError(null); }}>
        <DialogTrigger asChild>
          <Button variant="secondary" size={compact ? "sm" : "md"} disabled={!active || !delegationAllowed || agents.length === 0}>
            <GitBranch className="h-3.5 w-3.5" />
            Delegate
          </Button>
        </DialogTrigger>
        <DialogContent
          title="Delegate bounded authority"
          description="The child mandate is re-signed server-side and cannot exceed the parent's remaining budget, expiry or scope."
          className="max-w-xl"
        >
          <form onSubmit={delegate} className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-line bg-surface-input p-3 text-[11px] text-ink-secondary sm:grid-cols-3">
              <div>
                <p className="label-mono text-[8px]">Parent remaining</p>
                <p className="mono-value mt-1 text-ink">{formatMoney(remaining)} {currency}</p>
              </div>
              <div>
                <p className="label-mono text-[8px]">Parent expiry</p>
                <p className="mono-value mt-1 text-ink">{new Date(expiresAt).toISOString().slice(0, 16)}Z</p>
              </div>
              <div>
                <p className="label-mono text-[8px]">Parent mandate</p>
                <p className="mono-value mt-1 truncate text-ink">{mandateId}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Child agent" htmlFor="delegate-agent">
                <Select id="delegate-agent" name="agentId" required>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} · {agent.tier}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Child title" htmlFor="delegate-title">
                <Input id="delegate-title" name="title" required placeholder="Scoped procurement" />
              </Field>
              <Field label={`Total ceiling (${currency})`} htmlFor="delegate-total">
                <Input
                  id="delegate-total"
                  name="maxTotal"
                  inputMode="decimal"
                  required
                  defaultValue={Math.min(remaining, Number(maxPerTransaction)).toFixed(2)}
                />
              </Field>
              <Field label={`Per-transaction (${currency})`} htmlFor="delegate-pertx">
                <Input
                  id="delegate-pertx"
                  name="maxPerTransaction"
                  inputMode="decimal"
                  required
                  defaultValue={Math.min(Number(maxPerTransaction), remaining).toFixed(2)}
                />
              </Field>
              <Field label="Max transactions" htmlFor="delegate-count">
                <Input id="delegate-count" name="maxTransactions" type="number" min={1} defaultValue={Math.min(1, maxTransactions)} required />
              </Field>
              <Field label="Expires (UTC)" htmlFor="delegate-expiry">
                <Input id="delegate-expiry" name="expiresAt" type="datetime-local" defaultValue={defaultExpiry} required />
              </Field>
            </div>

            <Field label="Merchants (comma separated, subset of parent)" htmlFor="delegate-merchants">
              <Input id="delegate-merchants" name="merchants" defaultValue={merchants.join(", ")} required />
            </Field>
            <Field label="Categories (comma separated, subset of parent)" htmlFor="delegate-categories">
              <Input id="delegate-categories" name="categories" defaultValue={categories.join(", ")} required />
            </Field>

            {error ? <Notice tone="error">{error}</Notice> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setDelegateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
                Sign child mandate
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={revokeOpen} onOpenChange={(value) => { setRevokeOpen(value); setError(null); }}>
        <DialogTrigger asChild>
          <Button variant="destructive" size={compact ? "sm" : "md"} disabled={!active}>
            <ShieldOff className="h-3.5 w-3.5" />
            Revoke
          </Button>
        </DialogTrigger>
        <DialogContent
          title={`Revoke ${mandateId}?`}
          description="Revocation is immediate and cascades to every delegated child mandate. The signature remains valid cryptography, but the policy engine rejects revoked mandates."
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-crimson/25 bg-crimson/5 p-3 text-[12px] leading-5 text-ink-secondary">
              Any in-flight proposals will be blocked at the next evaluation. Existing PayPal orders
              that have not been captured will be released.
            </div>
            <Field label="Reason (recorded in the audit chain)" htmlFor="revoke-reason">
              <Textarea
                id="revoke-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={400}
                placeholder="Anomalous merchant detected by owner review"
              />
            </Field>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRevokeOpen(false)}>
                Keep mandate
              </Button>
              <Button variant="destructive" onClick={revoke} disabled={pending}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                Revoke mandate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
