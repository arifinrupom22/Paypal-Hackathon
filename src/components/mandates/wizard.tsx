"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  Fingerprint,
  Loader2,
  Lock,
  PenLine,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/empty-state";
import { ApiClientError, apiFetch } from "@/lib/client/api";
import { cn, parseUtcInput } from "@/lib/utils";

interface Draft {
  title: string;
  description: string;
  currency: string;
  maxTotal: string;
  maxPerTransaction: string;
  maxTransactions: number;
  expiresAt: string;
  merchants: string[];
  categories: string[];
  delegationAllowed: boolean;
  approvalThreshold: string;
  confidence: number;
  notes: string;
}

interface AgentOption {
  id: string;
  name: string;
  tier: string;
}

const STEPS = [
  { id: 1, label: "Describe Intent", icon: PenLine },
  { id: 2, label: "Extract Permissions", icon: ScanSearch },
  { id: 3, label: "Security Review", icon: ShieldCheck },
  { id: 4, label: "Cryptographic Authorization", icon: Fingerprint },
];

const EXAMPLE =
  "Find a laptop stand under $50. Only purchase from approved merchants. Allow one transaction within 24 hours.";

export function MandateWizard({
  agents,
  catalog,
  geminiConfigured,
}: {
  agents: AgentOption[];
  catalog: { merchants: string[]; categories: string[] };
  geminiConfigured: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [instruction, setInstruction] = React.useState("");
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [parser, setParser] = React.useState<{ engine: string; model: string } | null>(null);
  const [agentId, setAgentId] = React.useState(agents[0]?.id ?? "");
  const [confirmed, setConfirmed] = React.useState(false);
  const [pending, setPending] = React.useState<"parse" | "sign" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<{ mandateId: string; id: string } | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const coerceDraft = (value: Record<string, unknown>, expiry: string): Draft => ({
    title: String(value.title ?? "Autonomous purchase mandate"),
    description: String(value.description ?? ""),
    currency: String(value.currency ?? "USD"),
    maxTotal: String(value.maxTotal ?? "0.00"),
    maxPerTransaction: String(value.maxPerTransaction ?? "0.00"),
    maxTransactions: Number(value.maxTransactions ?? 1),
    expiresAt: expiry,
    merchants: Array.isArray(value.merchants) ? (value.merchants as string[]) : [],
    categories: Array.isArray(value.categories) ? (value.categories as string[]) : [],
    delegationAllowed: Boolean(value.delegationAllowed),
    approvalThreshold: value.approvalThreshold ? String(value.approvalThreshold) : "",
    confidence: typeof value.confidence === "number" ? value.confidence : 0.5,
    notes: String(value.notes ?? ""),
  });

  async function parseIntent() {
    setPending("parse");
    setError(null);
    try {
      const response = await apiFetch<{
        draft: Record<string, unknown>;
        parser: { engine: string; model: string };
      }>("/api/mandates/parse", { json: { instruction } });
      const expiresAt = String(response.draft.expiresAt ?? new Date(Date.now() + 86400_000).toISOString());
      setDraft(coerceDraft(response.draft, expiresAt.slice(0, 16)));
      setParser(response.parser);
      setStep(2);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Intent could not be parsed.");
    } finally {
      setPending(null);
    }
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function review() {
    if (!draft) return;
    const issues: Record<string, string> = {};
    if (draft.title.trim().length < 3) issues.title = "Give the mandate a title.";
    if (!(Number(draft.maxTotal) > 0)) issues.maxTotal = "Total ceiling must be positive.";
    if (!(Number(draft.maxPerTransaction) > 0)) issues.maxPerTransaction = "Per-transaction ceiling must be positive.";
    if (Number(draft.maxPerTransaction) > Number(draft.maxTotal))
      issues.maxPerTransaction = "Per-transaction ceiling cannot exceed the total ceiling.";
    if (draft.merchants.length === 0) issues.merchants = "Add at least one approved merchant.";
    if (draft.categories.length === 0) issues.categories = "Add at least one allowed category.";
    if (!agentId) issues.agentId = "Select an agent.";
    if (Number(draft.maxTransactions) < 1) issues.maxTransactions = "Allow at least one transaction.";
    if (parseUtcInput(draft.expiresAt).getTime() <= Date.now() + 30_000)
      issues.expiresAt = "Expiry must be at least 30 seconds in the future.";
    setFieldErrors(issues);
    if (Object.keys(issues).length > 0) return;
    setStep(3);
  }

  async function sign() {
    if (!draft || !confirmed) return;
    setPending("sign");
    setError(null);
    try {
      const result = await apiFetch<{ mandateId: string; id: string }>("/api/mandates", {
        json: {
          title: draft.title,
          description: draft.description,
          agentId,
          currency: draft.currency,
          maxTotal: draft.maxTotal,
          maxPerTransaction: draft.maxPerTransaction,
          approvalThreshold: draft.approvalThreshold || null,
          maxTransactions: draft.maxTransactions,
          expiresAt: parseUtcInput(draft.expiresAt).toISOString(),
          delegationAllowed: draft.delegationAllowed,
          merchants: draft.merchants,
          categories: draft.categories,
        },
      });
      setIssued(result);
      setStep(4);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
        const details = caught.details as { issues?: { path: string; message: string }[] } | undefined;
        if (details?.issues) {
          setFieldErrors(Object.fromEntries(details.issues.map((issue) => [issue.path, issue.message])));
        }
      } else {
        setError("Mandate signing failed.");
      }
    } finally {
      setPending(null);
    }
  }

  const remainingBudget = draft ? Number(draft.maxTotal) - 0 : 0;

  return (
    <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <div className="space-y-5">
        <div className="grid gap-2 rounded-xl border border-line bg-surface p-2 sm:grid-cols-4">
          {STEPS.map((entry) => {
            const Icon = entry.icon;
            const active = step === entry.id;
            const complete = step > entry.id;
            return (
              <div
                key={entry.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-3 py-2.5",
                  active
                    ? "border-teal/40 bg-teal/5"
                    : complete
                      ? "border-line bg-surface-input"
                      : "border-transparent",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                    active
                      ? "border-teal bg-teal/15 text-teal"
                      : complete
                        ? "border-emerald/40 bg-emerald/10 text-emerald"
                        : "border-line bg-surface-input text-ink-muted",
                  )}
                >
                  {complete ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="label-mono block text-[8px] text-ink-muted">Step {entry.id}</span>
                  <span className={cn("block truncate text-[12px]", active ? "text-ink" : "text-ink-secondary")}>
                    {entry.label}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        {step === 1 ? (
          <section className="rounded-xl border border-line bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-[17px] font-medium text-ink">
                  <Sparkles className="h-4 w-4 text-teal" />
                  Natural language intent
                </h2>
                <p className="mt-1 max-w-xl text-[13px] leading-5 text-ink-secondary">
                  Describe the purchase in plain language. PACT extracts explicit limits, then you
                  review and sign every field. The model never signs or authorizes anything.
                </p>
              </div>
              <Badge tone={geminiConfigured ? "teal" : "slate"}>
                {geminiConfigured ? "Gemini intent engine" : "Local parser"}
              </Badge>
            </div>

            <div className="mt-4">
              <Field label="Instruction" htmlFor="instruction">
                <Textarea
                  id="instruction"
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  placeholder={EXAMPLE}
                  className="min-h-[140px] text-[13px]"
                  maxLength={2000}
                />
              </Field>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-[11px] text-teal hover:underline"
                  onClick={() => setInstruction(EXAMPLE)}
                >
                  Use example instruction
                </button>
                <span className="mono-value text-[10px] text-ink-muted">{instruction.length}/2000</span>
              </div>
            </div>

            {!geminiConfigured ? (
              <Notice tone="warning" className="mt-4" title="Gemini API key not configured">
                PACT will use its deterministic parser, which extracts amounts, merchants, transaction
                counts and time windows from the instruction. All extracted fields remain editable and
                require your explicit confirmation.
              </Notice>
            ) : null}

            {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-line-soft pt-4">
              <Link href="/mandates" className="text-[12px] text-ink-secondary hover:text-ink">
                Cancel
              </Link>
              <Button
                variant="primary"
                onClick={parseIntent}
                disabled={pending === "parse" || instruction.trim().length < 10}
              >
                {pending === "parse" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ScanSearch className="h-4 w-4" />
                )}
                Extract permissions
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </section>
        ) : null}

        {step === 2 && draft ? (
          <section className="rounded-xl border border-line bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="label-mono">Structured mandate boundaries</span>
                <h2 className="mt-1 text-[17px] font-medium text-ink">Review every extracted field</h2>
                <p className="mt-1 max-w-xl text-[13px] leading-5 text-ink-secondary">
                  Nothing is signed yet. Edit any value — the mandate you approve is exactly what gets
                  serialized and signed with the platform Ed25519 key.
                </p>
              </div>
              {parser ? (
                <Badge tone={parser.engine === "gemini" ? "teal" : "slate"}>
                  {parser.engine === "gemini" ? parser.model : "deterministic parser"}
                  {draft.confidence ? ` · ${Math.round(draft.confidence * 100)}%` : ""}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Mandate title" htmlFor="w-title" error={fieldErrors.title} className="sm:col-span-2">
                <Input
                  id="w-title"
                  value={draft.title}
                  onChange={(event) => update("title", event.target.value)}
                  maxLength={120}
                />
              </Field>
              <Field label="Bound agent" htmlFor="w-agent" error={fieldErrors.agentId}>
                <Select id="w-agent" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
                  {agents.length === 0 ? <option value="">No active agents</option> : null}
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} · {agent.tier}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Currency" htmlFor="w-currency">
                <Select id="w-currency" value={draft.currency} onChange={(event) => update("currency", event.target.value)}>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — Pound Sterling</option>
                </Select>
              </Field>
              <Field label="Total ceiling" htmlFor="w-total" error={fieldErrors.maxTotal}>
                <Input
                  id="w-total"
                  inputMode="decimal"
                  value={draft.maxTotal}
                  onChange={(event) => update("maxTotal", event.target.value)}
                />
              </Field>
              <Field label="Per-transaction ceiling" htmlFor="w-pertx" error={fieldErrors.maxPerTransaction}>
                <Input
                  id="w-pertx"
                  inputMode="decimal"
                  value={draft.maxPerTransaction}
                  onChange={(event) => update("maxPerTransaction", event.target.value)}
                />
              </Field>
              <Field label="Max transactions" htmlFor="w-count" error={fieldErrors.maxTransactions}>
                <Input
                  id="w-count"
                  type="number"
                  min={1}
                  max={10000}
                  value={draft.maxTransactions}
                  onChange={(event) => update("maxTransactions", Number(event.target.value))}
                />
              </Field>
              <Field label="Expires (UTC)" htmlFor="w-expiry" error={fieldErrors.expiresAt}>
                <Input
                  id="w-expiry"
                  type="datetime-local"
                  value={draft.expiresAt}
                  onChange={(event) => update("expiresAt", event.target.value)}
                />
              </Field>
              <Field label="Step-up approval above (optional)" htmlFor="w-threshold" hint="Amounts above this require your approval before checkout.">
                <Input
                  id="w-threshold"
                  inputMode="decimal"
                  value={draft.approvalThreshold}
                  onChange={(event) => update("approvalThreshold", event.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Delegation" htmlFor="w-delegation">
                <Select
                  id="w-delegation"
                  value={draft.delegationAllowed ? "yes" : "no"}
                  onChange={(event) => update("delegationAllowed", event.target.value === "yes")}
                >
                  <option value="no">No sub-agents</option>
                  <option value="yes">Allow bounded delegation</option>
                </Select>
              </Field>
              <Field
                label="Approved merchants"
                htmlFor="w-merchants"
                error={fieldErrors.merchants}
                hint="Comma separated. Matching is case-insensitive on merchant name or domain."
              >
                <Input
                  id="w-merchants"
                  value={draft.merchants.join(", ")}
                  onChange={(event) =>
                    update(
                      "merchants",
                      event.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                    )
                  }
                />
              </Field>
              <Field label="Allowed categories" htmlFor="w-categories" error={fieldErrors.categories}>
                <Input
                  id="w-categories"
                  value={draft.categories.join(", ")}
                  onChange={(event) =>
                    update(
                      "categories",
                      event.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                    )
                  }
                />
              </Field>
              <Field label="Notes from parser" htmlFor="w-notes" className="sm:col-span-2">
                <Textarea
                  id="w-notes"
                  value={draft.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  className="min-h-[70px]"
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-4">
              <span className="label-mono mr-1 self-center text-[8px]">Catalog references</span>
              {[...catalog.merchants.slice(0, 4), ...catalog.categories.slice(0, 3)].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    catalog.merchants.includes(value)
                      ? update("merchants", Array.from(new Set([...draft.merchants, value])))
                      : update("categories", Array.from(new Set([...draft.categories, value])))
                  }
                  className="pill border-line bg-surface-input text-ink-muted hover:border-teal/40 hover:text-teal"
                >
                  + {value}
                </button>
              ))}
            </div>

            {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-line-soft pt-4">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" /> Back to intent
              </Button>
              <Button variant="primary" onClick={review}>
                Continue to security review <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </section>
        ) : null}

        {step === 3 && draft ? (
          <section className="rounded-xl border border-line bg-surface p-6">
            <span className="label-mono">Deterministic review</span>
            <h2 className="mt-1 text-[17px] font-medium text-ink">Confirm the signed policy</h2>
            <p className="mt-1 max-w-xl text-[13px] leading-5 text-ink-secondary">
              The policy engine will enforce these exact limits on every proposal. Review the
              boundaries and authorize the server-side signing operation.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Agent", agents.find((agent) => agent.id === agentId)?.name ?? "—"],
                ["Total ceiling", `${draft.maxTotal} ${draft.currency}`],
                ["Per transaction", `${draft.maxPerTransaction} ${draft.currency}`],
                ["Transaction limit", `${draft.maxTransactions} authorization${draft.maxTransactions === 1 ? "" : "s"}`],
                ["Expires", `${parseUtcInput(draft.expiresAt).toISOString().slice(0, 16).replace("T", " ")} UTC`],
                ["Step-up approval", draft.approvalThreshold ? `Above ${draft.approvalThreshold} ${draft.currency}` : "Not required"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line bg-surface-input p-3">
                  <p className="label-mono text-[8px]">{label}</p>
                  <p className="mono-value mt-1 text-[12px] text-ink">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-2 rounded-lg border border-line bg-surface-input p-3">
              <p className="label-mono text-[8px]">Merchant allowlist</p>
              <div className="flex flex-wrap gap-1.5">
                {draft.merchants.map((merchant) => (
                  <span key={merchant} className="pill border-teal/30 bg-teal/5 text-teal">{merchant}</span>
                ))}
              </div>
              <p className="label-mono mt-2 text-[8px]">Allowed categories</p>
              <div className="flex flex-wrap gap-1.5">
                {draft.categories.map((category) => (
                  <span key={category} className="pill border-line bg-surface text-ink-secondary">{category}</span>
                ))}
              </div>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-amber/30 bg-amber/5 p-3">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-teal"
              />
              <span className="text-[12px] leading-5 text-ink-secondary">
                I authorize PACT to serialize these permissions and sign this mandate with the
                platform Ed25519 key. I understand that a signed mandate is only valid while it
                remains active, unexpired and unrevoked in the database.
              </span>
            </label>

            {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4" /> Edit permissions
              </Button>
              <Button variant="primary" onClick={sign} disabled={!confirmed || pending === "sign"}>
                {pending === "sign" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Sign &amp; issue mandate
              </Button>
            </div>
          </section>
        ) : null}

        {step === 4 && issued ? (
          <section className="rounded-xl border border-teal/30 bg-surface p-6 glow-teal">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-teal/40 bg-teal/10 text-teal">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-[18px] font-medium text-ink">Mandate signed and armed</h2>
                <p className="text-[12px] text-ink-secondary">
                  The policy engine can now evaluate proposals against this mandate.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-line bg-surface-input p-3">
              <p className="label-mono text-[8px]">Mandate identifier</p>
              <p className="mono-value mt-1 text-[14px] text-teal">{issued.mandateId}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/mandates/${issued.mandateId}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal px-3 text-[12px] font-semibold text-canvas hover:bg-teal-deep">
                Inspect cryptographic proof <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link href="/payments" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-raised px-3 text-[12px] text-ink hover:border-teal/40">
                Run agent checkout
              </Link>
            </div>
          </section>
        ) : null}
      </div>

      <aside className="space-y-5">
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-medium text-ink">
              <ShieldCheck className="h-4 w-4 text-teal" />
              Security enforcement
            </h2>
            <Badge tone="teal">Deterministic engine</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {[
              ["Ed25519 signature verification", "Canonical payload re-derived from stored columns"],
              ["Replay protection", "Execution ID and idempotency key uniqueness"],
              ["Merchant hijack defence", "Allowlist matches name, merchant ID or domain"],
              ["Budget containment", "Atomic reservation with row-level locking"],
              ["Parent revocation propagation", "Delegated chains re-checked at decision time"],
              ["Step-up approval", "Owner approval bound to the exact proposal"],
            ].map(([title, detail]) => (
              <div key={title} className="flex gap-2.5">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
                <div>
                  <p className="text-[12px] text-ink">{title}</p>
                  <p className="text-[10px] leading-4 text-ink-muted">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-[15px] font-medium text-ink">Authorizer signature</h2>
          <p className="mt-1 text-[11px] leading-4 text-ink-secondary">
            Signing happens only on the server, after your confirmation, with the platform key held
            outside the browser.
          </p>
          <div className="mt-3 space-y-2 text-[11px]">
            <div className="flex items-center justify-between border-b border-line-soft pb-2">
              <span className="text-ink-muted">Algorithm</span>
              <span className="mono-value text-ink">Ed25519 (RFC 8032)</span>
            </div>
            <div className="flex items-center justify-between border-b border-line-soft pb-2">
              <span className="text-ink-muted">Canonical form</span>
              <span className="mono-value text-ink">sorted JSON · SHA-256</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Key location</span>
              <span className="mono-value text-teal">server enclave</span>
            </div>
          </div>
          {draft ? (
            <div className="mt-3 rounded-lg border border-line bg-canvas p-3">
              <p className="label-mono text-[8px]">Draft summary</p>
              <p className="mono-value mt-1 text-[11px] text-ink-secondary">
                {draft.currency} {draft.maxTotal} · {draft.maxTransactions} tx ·{" "}
                {remainingBudget >= 0 ? `${draft.merchants.length} merchants` : ""}
              </p>
            </div>
          ) : (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-canvas p-3 text-[11px] text-ink-muted">
              <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Describe an intent to begin. Nothing is created until step 4.
            </div>
          )}
        </div>

        {!geminiConfigured ? (
          <Notice tone="warning" title="Model access">
            Add GEMINI_API_KEY to switch intent extraction to Gemini. The deterministic
            parser keeps the workflow functional and is clearly labelled in the UI.
          </Notice>
        ) : null}

        {error && step !== 1 ? (
          <Notice tone="error" title="Signing blocked">
            <span className="flex items-start gap-1.5">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              {error}
            </span>
          </Notice>
        ) : null}
      </aside>
    </div>
  );
}
