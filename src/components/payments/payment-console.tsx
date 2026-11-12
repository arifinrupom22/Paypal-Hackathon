"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CreditCard,
  Cpu,
  ExternalLink,
  Fingerprint,
  Loader2,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/ui/empty-state";
import { Field, Select, Textarea } from "@/components/ui/input";
import { ApiClientError, apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/utils";

interface MandateOption {
  id: string;
  mandateId: string;
  title: string;
  currency: string;
  remaining: string;
  maxPerTransaction: string;
  merchants: string[];
  categories: string[];
  agentName: string;
}

interface CatalogOption {
  sku: string;
  name: string;
  merchant: string;
  category: string;
  price: string;
  currency: string;
}

interface Check {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

interface DecisionResult {
  outcome: string;
  decision: {
    decisionId: string;
    outcome: string;
    checks: Check[];
    failedCheckIds: string[];
    explanation: string;
  };
  transactionId: string | null;
  approvalId: string | null;
  approvalToken: string | null;
}

export function PaymentConsole({
  mandates,
  catalog,
  paypalConfigured,
}: {
  mandates: MandateOption[];
  catalog: CatalogOption[];
  paypalConfigured: boolean;
}) {
  const router = useRouter();
  const [mandateId, setMandateId] = React.useState(mandates[0]?.id ?? "");
  const [instruction, setInstruction] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [proposal, setProposal] = React.useState<{
    id: string;
    proposalId: string;
    amount: string;
    currency: string;
    merchant: string;
    category: string;
    description: string;
    agentName: string;
  } | null>(null);
  const [selection, setSelection] = React.useState<{
    name: string;
    rationale: string;
    engine: string;
    model: string;
    configured: boolean;
  } | null>(null);
  const [decision, setDecision] = React.useState<DecisionResult | null>(null);
  const [showAllChecks, setShowAllChecks] = React.useState(false);
  const [order, setOrder] = React.useState<{ orderId: string; approveUrl: string | null; status: string } | null>(null);

  const mandate = mandates.find((entry) => entry.id === mandateId);
  const filteredCatalog = catalog.filter((item) => !mandate || item.currency === mandate.currency);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setPending("proposal");
    setError(null);
    setDecision(null);
    setOrder(null);
    setProposal(null);
    setSelection(null);
    try {
      const result = await apiFetch<{
        proposal: typeof proposal;
        selection: typeof selection;
      }>("/api/proposals", {
        json: { mandateId, instruction, sku: sku || undefined },
      });
      setProposal(result.proposal);
      setSelection(result.selection);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Proposal generation failed.");
    } finally {
      setPending(null);
    }
  }

  async function evaluate(approvalId?: string) {
    if (!proposal) return;
    setPending("evaluate");
    setError(null);
    try {
      const result = await apiFetch<DecisionResult>("/api/policy/evaluate", {
        json: {
          proposalId: proposal.id,
          executionId: `exec_${crypto.randomUUID()}`,
          idempotencyKey: `idem_${crypto.randomUUID()}`,
          approvalId: approvalId ?? null,
        },
      });
      setDecision(result);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Policy evaluation failed.");
    } finally {
      setPending(null);
    }
  }

  async function approve() {
    if (!decision?.approvalId) return;
    setPending("approve");
    setError(null);
    try {
      await apiFetch(`/api/approvals/${decision.approvalId}`, { json: { decision: "APPROVE" } });
      await evaluate(decision.approvalId);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Approval failed.");
      setPending(null);
    }
  }

  async function createOrder() {
    if (!decision?.transactionId) return;
    setPending("order");
    setError(null);
    try {
      const result = await apiFetch<{ orderId: string; approveUrl: string | null; status: string }>(
        "/api/payments/create-order",
        { json: { transactionId: decision.transactionId } },
      );
      setOrder(result);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "PayPal order could not be created. Verify sandbox credentials.",
      );
    } finally {
      setPending(null);
    }
  }

  if (mandates.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6">
        <EmptyState
          icon={<ShieldAlert className="h-4 w-4" />}
          title="No active mandate available"
          description="An agent can only propose a purchase under a signed, active mandate. Create one first."
          action={
            <Link href="/mandates/new" className="text-[12px] text-teal hover:underline">
              Create a mandate →
            </Link>
          }
        />
      </div>
    );
  }

  const visibleChecks = decision
    ? showAllChecks
      ? decision.decision.checks
      : decision.decision.checks.filter((check) => !check.passed || check.id === "mandate_signature" || check.id === "budget_available")
    : [];

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <Sparkles className="h-4 w-4 text-teal" />
            Autonomous purchase console
          </h2>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            The agent selects a catalog item. PACT evaluates it independently before PayPal exists.
          </p>
        </div>
        <Badge tone={paypalConfigured ? "teal" : "amber"}>
          {paypalConfigured ? "PayPal sandbox linked" : "PayPal not configured"}
        </Badge>
      </div>

      <div className="space-y-4 p-5">
        <form onSubmit={generate} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mandate" htmlFor="pc-mandate">
              <Select
                id="pc-mandate"
                value={mandateId}
                onChange={(event) => {
                  setMandateId(event.target.value);
                  setSku("");
                  setProposal(null);
                  setDecision(null);
                  setOrder(null);
                }}
              >
                {mandates.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title} · {option.remaining} {option.currency} left
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Catalog item (optional)" htmlFor="pc-sku" hint="Amount always comes from the catalog, never from model output.">
              <Select id="pc-sku" value={sku} onChange={(event) => setSku(event.target.value)}>
                <option value="">Let the agent choose</option>
                {filteredCatalog.map((item) => (
                  <option key={item.sku} value={item.sku}>
                    {item.name} — {item.price} {item.currency}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Shopping instruction" htmlFor="pc-instruction">
            <Textarea
              id="pc-instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Find a laptop stand under $50 and buy it from an approved merchant."
              className="min-h-[76px]"
              maxLength={1000}
            />
          </Field>

          {mandate ? (
            <div className="flex flex-wrap gap-2 text-[10px] text-ink-muted">
              <span className="pill border-line bg-surface-input">agent {mandate.agentName}</span>
              <span className="pill border-line bg-surface-input">cap {mandate.maxPerTransaction} {mandate.currency}/tx</span>
              <span className="pill border-line bg-surface-input">
                merchants: {mandate.merchants.slice(0, 2).join(", ")}
              </span>
              <span className="pill border-line bg-surface-input">
                categories: {mandate.categories.slice(0, 2).join(", ")}
              </span>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={pending !== null || instruction.trim().length < 5}>
              {pending === "proposal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
              Generate signed proposal
            </Button>
          </div>
        </form>

        {error ? <Notice tone="error">{error}</Notice> : null}

        {proposal ? (
          <div className="rounded-lg border border-line bg-surface-input p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="label-mono text-[8px]">Proposal {proposal.proposalId}</p>
                <p className="mt-1 text-[14px] text-ink">{proposal.merchant}</p>
                <p className="mt-0.5 text-[11px] text-ink-secondary">{proposal.description}</p>
              </div>
              <div className="text-right">
                <p className="mono-value text-[19px] text-teal">
                  {proposal.amount} {proposal.currency}
                </p>
                <p className="mono-value text-[9px] text-ink-muted">{proposal.category}</p>
              </div>
            </div>

            {selection ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3 text-[10px] text-ink-muted">
                <Badge tone={selection.engine === "gemini" ? "teal" : "slate"}>
                  <Sparkles className="h-3 w-3" /> {selection.engine === "gemini" ? selection.model : "deterministic selector"}
                </Badge>
                <span className="flex items-start gap-1.5 text-ink-secondary">
                  <Cpu className="mt-0.5 h-3 w-3" />
                  {selection.rationale}
                </span>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[10px] text-ink-muted">
                <Fingerprint className="h-3 w-3" />
                Proposal signed by the agent&apos;s Ed25519 identity
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => evaluate()} disabled={pending !== null}>
                  {pending === "evaluate" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                  Evaluate with PACT
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {decision ? (
          <div
            className={cn(
              "rounded-lg border p-4",
              decision.outcome === "AUTHORIZED"
                ? "border-emerald/30 bg-emerald/5"
                : decision.outcome === "REQUIRES_USER_APPROVAL"
                  ? "border-amber/30 bg-amber/5"
                  : "border-crimson/30 bg-crimson/5",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  {decision.outcome === "AUTHORIZED" ? (
                    <ShieldCheck className="h-4 w-4 text-emerald" />
                  ) : decision.outcome === "REQUIRES_USER_APPROVAL" ? (
                    <AlertTriangle className="h-4 w-4 text-amber" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-crimson" />
                  )}
                  <span className="text-[14px] font-medium text-ink">{decision.outcome}</span>
                  <span className="mono-value text-[9px] text-ink-muted">{decision.decision.decisionId}</span>
                </div>
                <p className="mt-1 max-w-xl text-[11px] leading-5 text-ink-secondary">
                  {decision.decision.explanation}
                </p>
              </div>
              {decision.outcome === "AUTHORIZED" ? (
                <Badge tone="emerald">Budget reserved atomically</Badge>
              ) : null}
            </div>

            <div className="mt-3 space-y-1.5">
              {visibleChecks.map((check) => (
                <div key={check.id} className="flex items-start gap-2 text-[10px]">
                  {check.passed ? (
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-teal" />
                  ) : (
                    <X className="mt-0.5 h-3 w-3 shrink-0 text-crimson" />
                  )}
                  <span className={check.passed ? "text-ink-secondary" : "text-crimson"}>
                    <span className="text-ink">{check.label}: </span>
                    {check.detail}
                  </span>
                </div>
              ))}
              {decision.decision.checks.length > visibleChecks.length ? (
                <button
                  type="button"
                  className="text-[10px] text-teal hover:underline"
                  onClick={() => setShowAllChecks(true)}
                >
                  Show all {decision.decision.checks.length} checks
                </button>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
              {decision.outcome === "AUTHORIZED" && decision.transactionId ? (
                paypalConfigured ? (
                  <Button variant="primary" size="sm" onClick={createOrder} disabled={pending !== null || Boolean(order)}>
                    {pending === "order" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                    Create PayPal order
                  </Button>
                ) : (
                  <Link href="/settings" className="text-[11px] text-amber hover:underline">
                    PayPal sandbox credentials are required before checkout →
                  </Link>
                )
              ) : null}

              {decision.outcome === "REQUIRES_USER_APPROVAL" && decision.approvalId ? (
                <Button variant="primary" size="sm" onClick={approve} disabled={pending !== null}>
                  {pending === "approve" || pending === "evaluate" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BadgeCheck className="h-3.5 w-3.5" />
                  )}
                  Approve as owner and re-evaluate
                </Button>
              ) : null}

              <span className="ml-auto text-[10px] text-ink-muted">
                PACT authorization is not PayPal buyer approval.
              </span>
            </div>

            {order ? (
              <div className="mt-3 rounded-lg border border-amber/30 bg-amber/5 p-3">
                <p className="text-[12px] text-amber">
                  PayPal order {order.orderId} created — buyer approval pending.
                </p>
                <p className="mt-1 text-[11px] leading-4 text-ink-secondary">
                  No payment has been captured. Continue to PayPal to approve, then PACT captures the
                  order server-side and verifies the result.
                </p>
                {order.approveUrl ? (
                  <a
                    href={order.approveUrl}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-teal hover:underline"
                  >
                    Continue to PayPal checkout <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
