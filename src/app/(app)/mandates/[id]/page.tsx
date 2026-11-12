import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  GitBranch,
  Fingerprint,
  KeyRound,
  ShieldOff,
  Store,
  Users,
} from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { getMandateDetail, mandatePayloadOf } from "@/lib/services/mandates";
import { buildMandatePayload } from "@/lib/crypto/mandate-payload";
import { platformKeys } from "@/lib/crypto/keys";
import { formatCurrency } from "@/lib/money";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/ui/copy-button";
import { ProofPanel } from "@/components/mandates/proof-panel";
import { MandateActions } from "@/components/mandates/mandate-actions";
import { db } from "@/lib/db";
import { formatDateTime, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MandateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const detail = await getMandateDetail(auth.userId, id);
  if (!detail) notFound();

  const { mandate, spend, transactions, decisions, approvals, proof } = detail;
  const agents = await db.agent.findMany({
    where: { ownerId: auth.userId, status: "ACTIVE" },
    select: { id: true, name: true, tier: true, parentAgentId: true },
  });

  const total = Number(mandate.maxTotal);
  const spent = Number(spend.spent);
  const remaining = Math.max(0, total - spent);
  const utilization = total > 0 ? Math.min(100, (spent / total) * 100) : 0;
  const expired = mandate.expiresAt.getTime() <= Date.now();
  const payload = buildMandatePayload(mandatePayloadOf(mandate));
  const key = platformKeys();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/mandates" className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink">
            <ArrowLeft className="h-3 w-3" /> Mandate Center
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={expired && mandate.status === "ACTIVE" ? "EXPIRED" : mandate.status} />
            <Badge tone={proof.valid ? "teal" : "crimson"}>{proof.valid ? "ED25519:VERIFIED" : "PROOF INVALID"}</Badge>
            <span className="mono-value text-[10px] text-ink-muted">{mandate.mandateId}</span>
            <CopyButton value={mandate.mandateId} label="Copy ID" />
          </div>
          <h1 className="mt-2 max-w-3xl text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ink">
            {mandate.title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-secondary">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" />
              {mandate.agent.name} ({mandate.agent.tier === "ROOT" ? "Root agent" : "Delegated agent"})
            </span>
            <span className="flex items-center gap-1.5">
              <KeyRound className="h-3 w-3 text-ink-muted" />
              {mandate.signingKeyId}
            </span>
          </p>
        </div>
        <MandateActions
          id={mandate.id}
          mandateId={mandate.mandateId}
          status={mandate.status}
          delegationAllowed={mandate.delegationAllowed}
          currency={mandate.currency}
          maxTotal={String(mandate.maxTotal)}
          spent={spend.spent}
          expiresAt={mandate.expiresAt.toISOString()}
          maxPerTransaction={String(mandate.maxPerTransaction)}
          maxTransactions={mandate.maxTransactions}
          merchants={mandate.scopes.filter((scope) => scope.type === "MERCHANT").map((scope) => scope.value)}
          categories={mandate.scopes.filter((scope) => scope.type === "CATEGORY").map((scope) => scope.value)}
          agents={agents}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Remaining balance", value: formatCurrency(remaining, mandate.currency), detail: `of ${formatCurrency(mandate.maxTotal, mandate.currency)} ceiling` },
          { label: "Reserved spend", value: formatCurrency(spent, mandate.currency), detail: `${spend.activeCount} active transaction${spend.activeCount === 1 ? "" : "s"}` },
          { label: "Per transaction", value: formatCurrency(mandate.maxPerTransaction, mandate.currency), detail: `${mandate.maxTransactions} total authorizations` },
          { label: "Expires", value: relativeTime(mandate.expiresAt), detail: formatDateTime(mandate.expiresAt) },
        ].map((stat) => (
          <Card key={stat.label} className="p-5">
            <p className="label-mono text-[9px]">{stat.label}</p>
            <p className="mono-value mt-2 text-[20px] text-ink">{stat.value}</p>
            <p className="mt-1 text-[11px] text-ink-muted">{stat.detail}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Execution parameters" description="Immutable signed constraints enforced by the policy engine." />
            <div className="mt-4 space-y-2">
              <div className="mb-2 flex items-center justify-between text-[10px] text-ink-muted">
                <span className="label-mono text-[8px]">Budget utilisation</span>
                <span className="mono-value">{utilization.toFixed(1)}%</span>
              </div>
              <ProgressBar value={utilization} tone={utilization > 90 ? "crimson" : utilization > 65 ? "amber" : "teal"} />
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="label-mono flex items-center gap-1.5 text-[8px]"><Store className="h-3 w-3" /> Allowed merchants</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {mandate.scopes.filter((scope) => scope.type === "MERCHANT").map((scope) => (
                    <span key={scope.id} className="pill border-teal/30 bg-teal/5 text-teal">{scope.value}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="label-mono flex items-center gap-1.5 text-[8px]"><Users className="h-3 w-3" /> Allowed categories</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {mandate.scopes.filter((scope) => scope.type === "CATEGORY").map((scope) => (
                    <span key={scope.id} className="pill border-line bg-surface-input text-ink-secondary">{scope.value}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="label-mono flex items-center gap-1.5 text-[8px]"><Fingerprint className="h-3 w-3" /> Constraints</p>
                <ul className="mt-2 space-y-1 text-[11px] text-ink-secondary">
                  <li>Max {mandate.maxTransactions} authorizations</li>
                  <li>{formatCurrency(mandate.maxPerTransaction, mandate.currency)} per transaction</li>
                  <li>{mandate.approvalThreshold ? `Step-up above ${formatCurrency(mandate.approvalThreshold, mandate.currency)}` : "No step-up threshold"}</li>
                  <li>{mandate.delegationAllowed ? "Delegation permitted" : "Leaf mandate (no sub-agents)"}</li>
                </ul>
              </div>
            </div>

            {mandate.description ? (
              <p className="mt-4 rounded-lg border border-line bg-surface-input p-3 text-[12px] leading-5 text-ink-secondary">
                {mandate.description}
              </p>
            ) : null}
            <p className="mt-2 text-[10px] leading-4 text-ink-muted">
              Signed parameters are immutable. To change scope, revoke this mandate and issue a new
              one; edits cannot preserve the original proof.
            </p>
          </Card>

          <Card className="p-0">
            <div className="p-5 pb-3">
              <CardHeader title="Authorization ledger" description="Transactions reserved against this mandate." />
            </div>
            {transactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-[12px]">
                  <thead className="table-head">
                    <tr>
                      <th className="px-5 py-2 font-medium">Transaction</th>
                      <th className="px-3 py-2 font-medium">Merchant</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Policy</th>
                      <th className="px-3 py-2 font-medium">PayPal</th>
                      <th className="px-3 py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => (
                      <tr key={transaction.id} className="border-b border-line-soft/70 last:border-0">
                        <td className="mono-value px-5 py-2.5 text-teal">
                          <Link href={`/transactions/${transaction.transactionId}`} className="hover:underline">
                            {transaction.transactionId}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-ink-secondary">{transaction.merchantName}</td>
                        <td className="mono-value px-3 py-2.5 text-right text-ink">
                          {formatCurrency(transaction.amount, transaction.currency)}
                        </td>
                        <td className="px-3 py-2.5"><StatusBadge status="AUTHORIZED" /></td>
                        <td className="px-3 py-2.5"><StatusBadge status={transaction.status} /></td>
                        <td className="mono-value px-3 py-2.5 text-[10px] text-ink-muted">{formatDateTime(transaction.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 pb-5">
                <EmptyState
                  icon={<Fingerprint className="h-4 w-4" />}
                  title="No transactions yet"
                  description="Every authorized proposal will be reserved here against this mandate's ceiling."
                />
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Policy decisions" description="Every evaluation against this mandate, including rejections." />
            {decisions.length > 0 ? (
              <div className="mt-4 divide-y divide-line-soft">
                {decisions.slice(0, 8).map((decision) => (
                  <div key={decision.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={decision.outcome} />
                        <span className="mono-value text-[10px] text-ink-muted">{decision.decisionId}</span>
                      </div>
                      <p className="mt-1 max-w-xl text-[11px] leading-4 text-ink-secondary">{decision.explanation}</p>
                      {decision.failedChecks.length > 0 ? (
                        <p className="mono-value mt-1 text-[10px] text-crimson">
                          failed: {decision.failedChecks.join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="mono-value text-[10px] text-ink-muted">{formatDateTime(decision.createdAt)}</span>
                      <Link href={`/decisions/${decision.decisionId}`} className="text-[10px] text-teal hover:underline">
                        Explain decision →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState className="mt-4 border-0 py-6" title="No policy decisions" description="Submit a proposal against this mandate to produce a decision record." />
            )}
          </Card>

          {approvals.length > 0 ? (
            <Card>
              <CardHeader title="Pending step-up approvals" description="Owner approval is bound to a single proposal and expires quickly." />
              <div className="mt-3 space-y-2">
                {approvals.map((approval) => (
                  <Link
                    key={approval.id}
                    href="/payments"
                    className="flex items-center justify-between rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[11px]"
                  >
                    <span className="text-amber">Approval {approval.approvalId}</span>
                    <span className="mono-value text-ink-muted">expires {formatDateTime(approval.expiresAt)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="min-w-0 space-y-5">
          <ProofPanel
            mandateId={mandate.mandateId}
            payload={payload}
            signature={mandate.signature}
            canonicalHash={mandate.canonicalHash}
            signingKeyId={mandate.signingKeyId}
            algorithm="Ed25519 (RFC 8032)"
            publicKeyFingerprint={key.fingerprint}
            publicKeyBase64={key.publicKeyBase64}
            status={expired && mandate.status === "ACTIVE" ? "EXPIRED" : mandate.status}
            expiresAt={mandate.expiresAt.toISOString()}
            revokedAt={mandate.revokedAt?.toISOString() ?? null}
            proof={proof}
          />

          <Card>
            <CardHeader title="Authority chain" description="Delegation provenance and descendants." />
            <div className="mt-3 space-y-2 text-[11px]">
              {mandate.parentMandate ? (
                <Link
                  href={`/mandates/${mandate.parentMandate.mandateId}`}
                  className="flex items-center justify-between rounded-lg border border-line bg-surface-input px-3 py-2 hover:border-teal/40"
                >
                  <span className="flex items-center gap-2 text-ink-secondary">
                    <GitBranch className="h-3 w-3 text-teal" /> Parent mandate
                  </span>
                  <span className="mono-value text-teal">{mandate.parentMandate.mandateId}</span>
                </Link>
              ) : (
                <p className="rounded-lg border border-line bg-surface-input px-3 py-2 text-ink-muted">
                  Root mandate — authority originates from your signed owner approval.
                </p>
              )}

              {mandate.childMandates.length > 0 ? (
                mandate.childMandates.map((child) => (
                  <Link
                    key={child.id}
                    href={`/mandates/${child.mandateId}`}
                    className="flex items-center justify-between rounded-lg border border-line bg-surface-input px-3 py-2 hover:border-teal/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{child.title}</span>
                      <span className="mono-value block text-[10px] text-ink-muted">{child.agent.name}</span>
                    </span>
                    <StatusBadge status={child.status} />
                  </Link>
                ))
              ) : (
                <p className="text-ink-muted">No delegated child mandates.</p>
              )}
            </div>
          </Card>

          {mandate.status === "REVOKED" ? (
            <div className="rounded-xl border border-crimson/25 bg-crimson/5 p-4">
              <p className="flex items-center gap-2 text-[13px] text-crimson">
                <ShieldOff className="h-4 w-4" /> Mandate revoked
              </p>
              <p className="mt-1 text-[11px] leading-4 text-ink-secondary">
                {mandate.revocationReason ?? "Revoked by owner"} · {mandate.revokedAt ? formatDateTime(mandate.revokedAt) : ""}
              </p>
              <p className="mt-2 text-[11px] leading-4 text-ink-muted">
                The Ed25519 signature remains cryptographically valid, but the policy engine rejects
                any proposal presented under a revoked mandate.
              </p>
            </div>
          ) : null}

          <Card>
            <CardHeader title="Enclave attestation" description="Deterministic checks bound to this mandate." />
            <div className="mt-3 space-y-2 text-[11px]">
              {[
                ["Signature algorithm", "Ed25519 (RFC 8032)"],
                ["Key identifier", key.keyId],
                ["Canonical hash", `${mandate.canonicalHash.slice(0, 24)}…`],
                ["Issued at", formatDateTime(mandate.issuedAt)],
                ["Nonce", `${mandate.nonce.slice(0, 18)}…`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-line-soft pb-2 last:border-0 last:pb-0">
                  <span className="text-ink-muted">{label}</span>
                  <span className="mono-value truncate text-ink">{value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
