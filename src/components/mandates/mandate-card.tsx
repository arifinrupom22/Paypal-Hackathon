import Link from "next/link";
import { ArrowUpRight, Clock, Fingerprint, GitBranch, ShieldCheck, Store, Users } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { MandateActions, type DelegateAgentOption } from "./mandate-actions";
import { formatCurrency } from "@/lib/money";
import { cn, relativeTime } from "@/lib/utils";

export interface MandateCardData {
  id: string;
  mandateId: string;
  title: string;
  description: string | null;
  status: string;
  currency: string;
  maxTotal: string;
  maxPerTransaction: string;
  spent: string;
  maxTransactions: number;
  transactionCount: number;
  expiresAt: string;
  delegationAllowed: boolean;
  agent: { id: string; name: string; tier: string };
  merchants: string[];
  categories: string[];
}

export function MandateCard({
  mandate,
  agents,
  childCount = 0,
}: {
  mandate: MandateCardData;
  agents: DelegateAgentOption[];
  childCount?: number;
}) {
  const total = Number(mandate.maxTotal);
  const spent = Number(mandate.spent);
  const remaining = Math.max(0, total - spent);
  const utilization = total > 0 ? Math.min(100, (spent / total) * 100) : 0;
  const expired = new Date(mandate.expiresAt).getTime() <= Date.now();

  return (
    <article
      className={cn(
        "rounded-xl border bg-surface p-5",
        mandate.status === "REVOKED" ? "border-crimson/25" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={expired && mandate.status === "ACTIVE" ? "EXPIRED" : mandate.status} />
          {mandate.status === "ACTIVE" ? (
            <Badge tone="teal" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Signed
            </Badge>
          ) : null}
          <span className="mono-value text-[10px] text-ink-muted">{mandate.mandateId}</span>
        </div>
        <div className="text-right">
          <p className="label-mono text-[8px]">Remaining balance</p>
          <p className="mono-value text-[19px] font-medium text-ink">
            {formatCurrency(remaining, mandate.currency)}
          </p>
          <p className="mono-value text-[10px] text-ink-muted">
            cap {formatCurrency(mandate.maxTotal, mandate.currency)}
          </p>
        </div>
      </div>

      <Link href={`/mandates/${mandate.mandateId}`} className="group mt-3 block">
        <h3 className="text-[16px] font-medium tracking-[-0.01em] text-ink group-hover:text-teal">
          {mandate.title}
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-secondary">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-teal" />
            Agent: {mandate.agent.name} ({mandate.agent.tier === "ROOT" ? "Root" : "Delegated"})
          </span>
          <span className="mono-value text-ink-muted">{mandate.mandateId.slice(0, 20)}…</span>
        </p>
      </Link>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-ink-muted">
          <span className="label-mono text-[8px]">Execution utilisation</span>
          <span className="mono-value">
            {formatCurrency(spent, mandate.currency)} spent · {utilization.toFixed(0)}%
          </span>
        </div>
        <ProgressBar value={utilization} tone={utilization > 90 ? "crimson" : utilization > 65 ? "amber" : "teal"} />
      </div>

      <div className="mt-4 grid gap-4 rounded-lg border border-line-soft bg-surface-input/60 p-3 sm:grid-cols-3">
        <div>
          <p className="label-mono flex items-center gap-1.5 text-[8px]">
            <Store className="h-3 w-3" /> Allowed merchants
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-ink-secondary">
            {mandate.merchants.join(", ")}
          </p>
        </div>
        <div>
          <p className="label-mono flex items-center gap-1.5 text-[8px]">
            <Fingerprint className="h-3 w-3" /> Ceilings
          </p>
          <p className="mt-1 text-[11px] leading-4 text-ink-secondary">
            {formatCurrency(mandate.maxPerTransaction, mandate.currency)} / tx ·{" "}
            {mandate.transactionCount}/{mandate.maxTransactions} used
          </p>
        </div>
        <div>
          <p className="label-mono flex items-center gap-1.5 text-[8px]">
            <Clock className="h-3 w-3" /> Expiry
          </p>
          <p className="mt-1 text-[11px] leading-4 text-ink-secondary">
            {new Date(mandate.expiresAt).toISOString().slice(0, 16).replace("T", " ")} UTC
            <span className="ml-1.5 text-ink-muted">({relativeTime(mandate.expiresAt)})</span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-ink-muted">
        <span className="pill border-line bg-surface-input">
          <Users className="h-3 w-3" />
          {mandate.categories.join(" · ")}
        </span>
        <span className="pill border-line bg-surface-input">
          <GitBranch className="h-3 w-3" />
          {mandate.delegationAllowed ? "Delegation permitted" : "Leaf mandate"}
        </span>
        {childCount > 0 ? (
          <span className="pill border-line bg-surface-input">{childCount} child mandates</span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
        <Link
          href={`/mandates/${mandate.mandateId}`}
          className="inline-flex items-center gap-1.5 text-[11px] text-teal hover:underline"
        >
          Inspect proof &amp; ledger
          <ArrowUpRight className="h-3 w-3" />
        </Link>
        <MandateActions
          id={mandate.id}
          mandateId={mandate.mandateId}
          status={mandate.status}
          delegationAllowed={mandate.delegationAllowed}
          currency={mandate.currency}
          maxTotal={mandate.maxTotal}
          spent={mandate.spent}
          expiresAt={mandate.expiresAt}
          maxPerTransaction={mandate.maxPerTransaction}
          maxTransactions={mandate.maxTransactions}
          merchants={mandate.merchants}
          categories={mandate.categories}
          agents={agents}
          compact
        />
      </div>
    </article>
  );
}
