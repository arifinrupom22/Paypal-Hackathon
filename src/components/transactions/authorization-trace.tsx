"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  CreditCard,
  Fingerprint,
  Lock,
  ShieldCheck,
  ShieldX,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface TraceCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface AuthorizationTraceProps {
  transaction: {
    transactionId: string;
    status: string;
    amount: string;
    currency: string;
    merchantName: string;
    category: string;
    createdAt: string;
    paypalOrderId: string | null;
    paypalCaptureId: string | null;
    paypalStatus: string | null;
    capturedAmount: string | null;
    reservedAt: string;
    capturedAt: string | null;
    failureMessage: string | null;
  };
  proposal: {
    proposalId: string;
    description: string;
    signature: string;
    canonicalHash: string;
    aiModel: string | null;
    aiRationale: string | null;
    rawInstruction: string | null;
    createdAt: string;
  };
  decision: {
    decisionId: string;
    outcome: string;
    explanation: string;
    failedChecks: string[];
    checks: TraceCheck[];
    createdAt: string;
  };
  mandate: {
    mandateId: string;
    title: string;
    status: string;
    maxTotal: string;
    maxPerTransaction: string;
    expiresAt: string;
    revokedAt: string | null;
  };
  agent: { name: string; status: string };
}

type StageState = "passed" | "failed" | "pending" | "not_started" | "not_recorded";

const STAGE_META = [
  { id: "proposal", label: "AI proposal", icon: Sparkles },
  { id: "mandate", label: "Mandate verification", icon: Fingerprint },
  { id: "agent", label: "Agent permission", icon: ShieldCheck },
  { id: "budget", label: "Budget check", icon: Lock },
  { id: "policy", label: "Policy decision", icon: ShieldCheck },
  { id: "paypal", label: "PayPal approval", icon: CreditCard },
  { id: "capture", label: "Payment capture", icon: CheckCircle2 },
] as const;

function checkState(checks: TraceCheck[]): StageState {
  if (checks.length === 0) return "not_recorded";
  return checks.every((check) => check.passed) ? "passed" : "failed";
}

function stateTone(state: StageState) {
  switch (state) {
    case "passed":
      return "border-emerald/35 bg-emerald/5 text-emerald";
    case "failed":
      return "border-crimson/35 bg-crimson/5 text-crimson";
    case "pending":
      return "border-amber/35 bg-amber/5 text-amber";
    default:
      return "border-line bg-surface-input text-ink-muted";
  }
}

function stateLabel(state: StageState) {
  switch (state) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "not_started":
      return "Not started";
    case "not_recorded":
      return "Not recorded";
  }
}

function StateIcon({ state }: { state: StageState }) {
  if (state === "passed") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (state === "failed") return <X className="h-3.5 w-3.5" />;
  if (state === "pending") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Circle className="h-3.5 w-3.5" />;
}

export function AuthorizationTrace({
  transaction,
  proposal,
  decision,
  mandate,
  agent,
}: AuthorizationTraceProps) {
  const [selected, setSelected] = React.useState<string>("proposal");

  const mandateChecks = decision.checks.filter((check) =>
    [
      "mandate_present",
      "mandate_ownership",
      "mandate_signature",
      "mandate_not_revoked",
      "mandate_not_expired",
      "mandate_status",
    ].includes(check.id),
  );
  const agentChecks = decision.checks.filter(
    (check) =>
      check.id === "agent_identity" ||
      check.id === "proposal_signature" ||
      check.id.startsWith("delegation_") ||
      check.id === "merchant_allowlist" ||
      check.id === "category_allowlist",
  );
  const budgetChecks = decision.checks.filter((check) =>
    [
      "amount_valid",
      "currency_match",
      "per_transaction_limit",
      "budget_available",
      "transaction_count",
      "execution_uniqueness",
      "approval_requirement",
    ].includes(check.id),
  );

  const paypalState: StageState = transaction.paypalCaptureId
    ? "passed"
    : transaction.paypalOrderId
      ? transaction.status === "FAILED" || transaction.status === "CANCELLED"
        ? "failed"
        : "pending"
      : transaction.status === "CANCELLED" || transaction.status === "FAILED"
        ? "failed"
        : "not_started";
  const captureState: StageState =
    transaction.paypalCaptureId && transaction.status === "SETTLED"
      ? "passed"
      : transaction.status === "FAILED"
        ? "failed"
        : transaction.paypalOrderId
          ? "pending"
          : "not_started";

  const stageStates: Record<string, StageState> = {
    proposal: "passed",
    mandate: checkState(mandateChecks),
    agent: checkState(agentChecks),
    budget: checkState(budgetChecks),
    policy:
      decision.outcome === "AUTHORIZED"
        ? decision.checks.every((check) => check.passed)
          ? "passed"
          : "failed"
        : "failed",
    paypal: paypalState,
    capture: captureState,
  };

  const stageChecks: Record<string, TraceCheck[]> = {
    proposal: [],
    mandate: mandateChecks,
    agent: agentChecks,
    budget: budgetChecks,
    policy: decision.checks,
    paypal: [],
    capture: [],
  };

  const current = STAGE_META.find((stage) => stage.id === selected) ?? STAGE_META[0];
  const currentChecks = stageChecks[selected] ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label-mono text-[8px]">Authorization path</p>
            <h2 className="mt-1 text-[16px] font-medium text-ink">Every stage, from proposal to capture</h2>
            <p className="mt-1 max-w-xl text-[11px] leading-4 text-ink-muted">
              Select a stage to inspect the policy checks and provider state recorded for this
              transaction. PACT authorization and PayPal buyer approval remain separate events.
            </p>
          </div>
          <Badge tone={decision.outcome === "AUTHORIZED" ? "emerald" : "crimson"}>
            {decision.outcome}
          </Badge>
        </div>

        <div className="mt-4 space-y-2">
          {STAGE_META.map((stage, index) => {
            const Icon = stage.icon;
            const state = stageStates[stage.id];
            const active = selected === stage.id;
            return (
              <div key={stage.id} className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => setSelected(stage.id)}
                    aria-pressed={active}
                    aria-label={`Inspect ${stage.label}: ${stateLabel(state)}`}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                      stateTone(state),
                      active && "ring-2 ring-teal/30",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                  {index < STAGE_META.length - 1 ? <span className="mt-1 h-full min-h-3 w-px bg-line" /> : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(stage.id)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                    active ? "border-teal/40 bg-surface-input" : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-[12px] text-ink">{stage.label}</span>
                    <span className="mono-value block truncate text-[9px] text-ink-muted">
                      {stage.id === "proposal"
                        ? proposal.proposalId
                        : stage.id === "mandate"
                          ? mandate.mandateId
                          : stage.id === "agent"
                            ? agent.name
                            : stage.id === "budget"
                              ? `${transaction.amount} ${transaction.currency} requested`
                              : stage.id === "policy"
                                ? decision.decisionId
                                : stage.id === "paypal"
                                  ? (transaction.paypalOrderId ?? "no order created")
                                  : (transaction.paypalCaptureId ?? "no capture recorded")}
                    </span>
                  </span>
                  <span className={cn("pill shrink-0", stateTone(state))}>
                    <StateIcon state={state} /> {stateLabel(state)}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <p className="label-mono text-[8px]">Stage inspector</p>
            <p className="text-[13px] text-ink">{current.label}</p>
          </div>
          <Badge tone={stageStates[current.id] === "failed" ? "crimson" : stageStates[current.id] === "passed" ? "emerald" : "slate"}>
            {stateLabel(stageStates[current.id])}
          </Badge>
        </div>

        <div className="space-y-3 p-4">
          {selected === "proposal" ? (
            <div className="space-y-2 text-[11px]">
              <p className="rounded-lg border border-line bg-surface-input p-3 leading-5 text-ink-secondary">
                {proposal.description}
              </p>
              <div className="grid gap-1.5">
                <Row label="Proposal" value={proposal.proposalId} mono />
                <Row label="Merchant" value={transaction.merchantName} />
                <Row label="Amount" value={`${transaction.amount} ${transaction.currency}`} mono />
                <Row label="Category" value={transaction.category} />
                <Row label="Signed hash" value={`${proposal.canonicalHash.slice(0, 28)}…`} mono />
                <Row label="AI rationale" value={proposal.aiRationale ?? "Operator-selected catalog item"} />
              </div>
              <p className="flex items-start gap-1.5 rounded-lg border border-teal/20 bg-teal/5 p-2.5 text-[10px] leading-4 text-ink-secondary">
                <Fingerprint className="mt-0.5 h-3 w-3 shrink-0 text-teal" />
                The agent signed this proposal with its own Ed25519 key. The proposal cannot alter
                the mandate; it can only request a purchase inside it.
              </p>
            </div>
          ) : null}

          {selected === "mandate" ? (
            <div className="space-y-2 text-[11px]">
              <Row label="Mandate" value={mandate.mandateId} mono />
              <Row label="Title" value={mandate.title} />
              <Row label="Status" value={mandate.status} />
              <Row label="Ceiling" value={`${mandate.maxTotal} ${transaction.currency}`} mono />
              <Row label="Per transaction" value={`${mandate.maxPerTransaction} ${transaction.currency}`} mono />
              <Row label="Expires" value={new Date(mandate.expiresAt).toISOString()} mono />
              {mandate.revokedAt ? <Row label="Revoked" value={mandate.revokedAt} mono /> : null}
              {currentChecks.length > 0 ? (
                <CheckList checks={currentChecks} />
              ) : (
                <p className="text-[10px] text-ink-muted">No mandate checks were recorded for this decision.</p>
              )}
            </div>
          ) : null}

          {selected === "agent" ? (
            <div className="space-y-2 text-[11px]">
              <Row label="Agent" value={agent.name} />
              <Row label="Agent status" value={agent.status} />
              <Row label="Proposal signature" value={proposal.signature.slice(0, 36) + "…"} mono />
              <CheckList checks={currentChecks} />
            </div>
          ) : null}

          {selected === "budget" ? (
            <div className="space-y-2">
              <p className="text-[10px] leading-4 text-ink-muted">
                Budget authority is validated and reserved inside a PostgreSQL transaction with a
                row lock. A failed check here produces no transaction.
              </p>
              <CheckList checks={currentChecks} />
            </div>
          ) : null}

          {selected === "policy" ? (
            <div className="space-y-2">
              <p className="rounded-lg border border-line bg-surface-input p-3 text-[11px] leading-5 text-ink-secondary">
                {decision.explanation}
              </p>
              <Row label="Decision" value={decision.decisionId} mono />
              <Row label="Outcome" value={decision.outcome} />
              {decision.failedChecks.length > 0 ? (
                <p className="rounded border border-crimson/25 bg-crimson/5 p-2 text-[10px] text-crimson">
                  Failed: {decision.failedChecks.join(", ")}
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-[10px] text-emerald">
                  <Check className="h-3 w-3" /> All recorded checks passed.
                </p>
              )}
            </div>
          ) : null}

          {selected === "paypal" ? (
            <div className="space-y-2 text-[11px]">
              <Row label="Transaction status" value={transaction.status} />
              <Row label="PayPal order" value={transaction.paypalOrderId ?? "Not created"} mono />
              <Row label="PayPal status" value={transaction.paypalStatus ?? "Not reported"} mono />
              {transaction.failureMessage ? (
                <p className="rounded border border-crimson/25 bg-crimson/5 p-2 text-[10px] text-crimson">
                  {transaction.failureMessage}
                </p>
              ) : null}
              <p className="text-[10px] leading-4 text-ink-muted">
                This stage is PayPal buyer approval. It is not a PACT authorization and does not prove
                settlement.
              </p>
            </div>
          ) : null}

          {selected === "capture" ? (
            <div className="space-y-2 text-[11px]">
              <Row label="Capture ID" value={transaction.paypalCaptureId ?? "Not captured"} mono />
              <Row label="Captured amount" value={transaction.capturedAmount ?? "—"} mono />
              <Row label="Settled at" value={transaction.capturedAt ?? "—"} mono />
              <p className="text-[10px] leading-4 text-ink-muted">
                A transaction becomes SETTLED only after PayPal reports COMPLETED with the expected
                amount and currency. PACT records the verified provider result.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line-soft pb-1.5 last:border-0 last:pb-0">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className={cn("max-w-[65%] break-all text-right text-ink", mono && "mono-value")}>{value}</span>
    </div>
  );
}

function CheckList({ checks }: { checks: TraceCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <div className="space-y-1.5 pt-1">
      {checks.map((check) => (
        <div key={check.id} className="flex items-start gap-2 text-[10px] leading-4">
          {check.passed ? (
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-teal" />
          ) : (
            <ShieldX className="mt-0.5 h-3 w-3 shrink-0 text-crimson" />
          )}
          <span className={check.passed ? "text-ink-secondary" : "text-crimson"}>
            <span className="text-ink">{check.label}: </span>
            {check.detail}
          </span>
        </div>
      ))}
    </div>
  );
}
