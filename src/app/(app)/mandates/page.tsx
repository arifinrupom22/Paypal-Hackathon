import Link from "next/link";
import { Clock, PlusCircle, Search, ShieldCheck, ShieldOff, Wallet } from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { listMandatesForOwner } from "@/lib/services/mandates";
import { db } from "@/lib/db";
import { MandateCard } from "@/components/mandates/mandate-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "EXHAUSTED", label: "Exhausted" },
  { value: "EXPIRED", label: "Expired" },
  { value: "REVOKED", label: "Revoked" },
];

export default async function MandatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; currency?: string; agentId?: string }>;
}) {
  const auth = await requirePageAuth();
  const params = await searchParams;
  const status = params.status?.toUpperCase() ?? "ALL";

  const [rows, agents] = await Promise.all([
    listMandatesForOwner(auth.userId, {
      status: status === "ALL" ? undefined : status,
      search: params.q,
      currency: params.currency,
      agentId: params.agentId,
    }),
    db.agent.findMany({
      where: { ownerId: auth.userId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, tier: true, parentAgentId: true },
    }),
  ]);

  const all = await listMandatesForOwner(auth.userId);
  const activeCount = all.filter((entry) => entry.mandate.status === "ACTIVE").length;
  const totalRemaining = all.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry.mandate.maxTotal) - Number(entry.spend.spent)),
    0,
  );
  const expiring = all.filter(
    (entry) =>
      entry.mandate.status === "ACTIVE" &&
      new Date(entry.mandate.expiresAt).getTime() < Date.now() + 48 * 3600_000,
  ).length;
  const revoked = all.filter((entry) => entry.mandate.status === "REVOKED").length;
  const childCounts = new Map<string, number>();
  for (const entry of all) {
    if (entry.mandate.parentMandateId) {
      childCounts.set(
        entry.mandate.parentMandateId,
        (childCounts.get(entry.mandate.parentMandateId) ?? 0) + 1,
      );
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="pill border-line bg-surface-input text-ink-muted">
            <ShieldCheck className="h-3 w-3 text-teal" />
            Deterministic enclave
          </span>
          <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-ink">Mandate Center</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-secondary">
            Cryptographically signed authorization policies binding autonomous agents to
            deterministic spending parameters, merchant allowlists and expiry windows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/mandates/export" download className={cn(buttonVariants({ variant: "secondary" }))}>
            Export signed JSON
          </a>
          <Link href="/mandates/new" className={cn(buttonVariants({ variant: "primary" }))}>
            <PlusCircle className="h-4 w-4" />
            New Mandate
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Active mandates",
            value: String(activeCount),
            detail: `${all.length} total signed policies`,
            icon: ShieldCheck,
            tone: "text-teal",
          },
          {
            label: "Remaining capacity",
            value: formatCurrency(totalRemaining, "USD"),
            detail: "Across active ceilings",
            icon: Wallet,
            tone: "text-ink",
          },
          {
            label: "Expiring < 48h",
            value: String(expiring),
            detail: "Pending renewal",
            icon: Clock,
            tone: "text-amber",
          },
          {
            label: "Revoked",
            value: String(revoked),
            detail: "Signature valid, authority withdrawn",
            icon: ShieldOff,
            tone: "text-crimson",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="p-5">
              <div className="flex items-start justify-between">
                <p className="label-mono text-[9px]">{stat.label}</p>
                <Icon className={cn("h-4 w-4", stat.tone)} />
              </div>
              <p className={cn("mono-value mt-3 text-[24px] font-medium leading-none", stat.tone)}>
                {stat.value}
              </p>
              <p className="mt-2 text-[11px] text-ink-muted">{stat.detail}</p>
            </Card>
          );
        })}
      </div>

      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search mandate ID, agent name, merchant…"
              className="field pl-9"
              aria-label="Search mandates"
            />
          </div>
          <select name="currency" defaultValue={params.currency ?? "ALL"} className="field w-[150px]" aria-label="Currency">
            <option value="ALL">All currencies</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
          </select>
          <select name="agentId" defaultValue={params.agentId ?? ""} className="field w-[190px]" aria-label="Agent">
            <option value="">All agents</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
          {params.q || params.currency || params.agentId ? (
            <Link href="/mandates" className={cn(buttonVariants({ variant: "ghost" }))}>
              Reset
            </Link>
          ) : null}
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
          <span className="label-mono mr-1 text-[9px]">Status filter</span>
          {STATUS_TABS.map((tab) => {
            const tabParams = new URLSearchParams();
            if (params.q) tabParams.set("q", params.q);
            if (params.currency && params.currency !== "ALL") tabParams.set("currency", params.currency);
            if (params.agentId) tabParams.set("agentId", params.agentId);
            if (tab.value !== "ALL") tabParams.set("status", tab.value);
            const href = tabParams.size > 0 ? `/mandates?${tabParams.toString()}` : "/mandates";
            const active = status === tab.value;
            return (
              <Link
                key={tab.value}
                href={href}
                className={cn(
                  "pill",
                  active
                    ? "border-teal/40 bg-teal/10 text-teal"
                    : "border-line bg-surface-input text-ink-muted hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
          <span className="ml-auto text-[11px] text-ink-muted">
            {rows.length} mandate{rows.length === 1 ? "" : "s"} in view
          </span>
        </div>
      </Card>

      {rows.length > 0 ? (
        <div className="space-y-4">
          {rows.map(({ mandate, spend }) => (
            <MandateCard
              key={mandate.id}
              mandate={{
                id: mandate.id,
                mandateId: mandate.mandateId,
                title: mandate.title,
                description: mandate.description,
                status: mandate.status,
                currency: mandate.currency,
                maxTotal: String(mandate.maxTotal),
                maxPerTransaction: String(mandate.maxPerTransaction),
                spent: spend.spent,
                maxTransactions: mandate.maxTransactions,
                transactionCount: spend.activeCount,
                expiresAt: mandate.expiresAt.toISOString(),
                delegationAllowed: mandate.delegationAllowed,
                agent: { id: mandate.agent.id, name: mandate.agent.name, tier: mandate.agent.tier },
                merchants: mandate.scopes
                  .filter((scope) => scope.type === "MERCHANT")
                  .map((scope) => scope.value),
                categories: mandate.scopes
                  .filter((scope) => scope.type === "CATEGORY")
                  .map((scope) => scope.value),
              }}
              agents={agents}
              childCount={childCounts.get(mandate.id) ?? 0}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ShieldCheck className="h-4 w-4" />}
          title="No mandates match this view"
          description="Create a signed mandate to define what an agent may buy, from whom, for how much and until when."
          action={
            <Link href="/mandates/new" className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
              <PlusCircle className="h-3.5 w-3.5" /> Create mandate
            </Link>
          }
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-muted">
        <span className="flex items-center gap-2">
          <StatusBadge status="ACTIVE" /> signed mandates remain subject to live revocation checks.
        </span>
        <span className="mono-value">Ed25519 · SHA-256 canonical payload</span>
      </div>
    </div>
  );
}
