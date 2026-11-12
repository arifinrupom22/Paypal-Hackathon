import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { listMandatesForOwner } from "@/lib/services/mandates";
import { listProposals } from "@/lib/services/proposals";
import { getPayPalConfig } from "@/lib/paypal";
import { PaymentConsole } from "@/components/payments/payment-console";
import { TransactionActions } from "@/components/payments/transaction-actions";
import { ApprovalActions } from "@/components/payments/approval-actions";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/money";
import { cn, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const auth = await requirePageAuth();

  const [rows, catalog, proposals, approvals, transactions, settled, pending, configured, buyerOrders, settledCount] =
    await Promise.all([
      listMandatesForOwner(auth.userId, { status: "ACTIVE" }),
      db.catalogItem.findMany({ where: { inStock: true }, orderBy: { name: "asc" } }),
      listProposals(auth.userId, 12),
      db.approvalRequest.findMany({
        where: { ownerId: auth.userId, status: "PENDING", expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.transaction.findMany({
        where: { ownerId: auth.userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { mandate: { select: { mandateId: true } } },
      }),
      db.transaction.aggregate({ where: { ownerId: auth.userId, status: "SETTLED" }, _sum: { amount: true } }),
      db.transaction.count({
        where: { ownerId: auth.userId, status: { in: ["AWAITING_BUYER_APPROVAL", "POLICY_APPROVED"] } },
      }),
      getPayPalConfig(),
      db.transaction.count({ where: { ownerId: auth.userId, paypalOrderId: { not: null } } }),
      db.transaction.count({ where: { ownerId: auth.userId, status: "SETTLED" } }),
    ]);

  const mandates = rows.map(({ mandate, spend }) => ({
    id: mandate.id,
    mandateId: mandate.mandateId,
    title: mandate.title,
    currency: mandate.currency,
    remaining: (Number(mandate.maxTotal) - Number(spend.spent)).toFixed(2),
    maxPerTransaction: String(mandate.maxPerTransaction),
    merchants: mandate.scopes.filter((scope) => scope.type === "MERCHANT").map((scope) => scope.value),
    categories: mandate.scopes.filter((scope) => scope.type === "CATEGORY").map((scope) => scope.value),
    agentName: mandate.agent.name,
  }));

  const approvalRows = approvals.map((approval) => ({
    approvalId: approval.approvalId,
    proposalId: approval.proposalId,
    mandateId: approval.mandateId,
    expiresAt: approval.expiresAt,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="pill border-line bg-surface-input text-ink-muted">
            <CreditCard className="h-3 w-3 text-teal" />
            Sovereign treasury bridge
          </span>
          <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-ink">
            Payment Center &amp; PayPal Integration
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-secondary">
            PACT authorizes against a signed mandate, reserves the amount atomically, then creates a
            PayPal order for buyer approval. Settlement is only recorded after PayPal confirms the
            capture.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 text-[11px]">
          <p className="flex items-center gap-2 text-ink-secondary">
            <span className={cn("h-1.5 w-1.5 rounded-full", configured ? "bg-teal" : "bg-amber")} />
            PayPal REST Orders v2
          </p>
          <p className="mono-value mt-1 text-ink">
            {configured ? `${configured.environment} · connected` : "credentials required"}
          </p>
          <p className="mono-value mt-0.5 text-[9px] text-ink-muted">
            {configured ? configured.baseUrl.replace("https://", "") : "set PAYPAL_CLIENT_ID / SECRET"}
          </p>
        </div>
      </div>

      {!configured ? (
        <Notice tone="warning" title="PayPal sandbox credentials are not configured">
          The authorization pipeline is fully operational, but order creation and capture remain
          disabled until <span className="mono-value">PAYPAL_CLIENT_ID</span> and{" "}
          <span className="mono-value">PAYPAL_CLIENT_SECRET</span> are set. PACT will not fabricate a
          payment.
        </Notice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <PaymentConsole
          mandates={mandates}
          catalog={catalog.map((item) => ({
            sku: item.sku,
            name: item.name,
            merchant: item.merchant,
            category: item.category,
            price: String(item.price),
            currency: item.currency,
          }))}
          paypalConfigured={Boolean(configured)}
        />

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Dual-stage governance"
              description="PACT authorization and PayPal buyer approval are separate, non-interchangeable stages."
            />
            <div className="mt-4 space-y-3">
              {[
                {
                  stage: "Stage 1",
                  title: "PACT policy authorization",
                  detail: "Ed25519 signature, scope, expiry, revocation, agent and budget are evaluated deterministically.",
                  complete: true,
                },
                {
                  stage: "Stage 2",
                  title: "Atomic budget reservation",
                  detail: "A transaction row holds the funds against the mandate under a row lock, preventing concurrent overspend.",
                  complete: true,
                },
                {
                  stage: "Stage 3",
                  title: "PayPal buyer approval",
                  detail: "The owner approves the order in PayPal checkout. This is not a PACT authorization.",
                  complete: buyerOrders > 0,
                },
                {
                  stage: "Stage 4",
                  title: "Server-side capture",
                  detail: "PACT captures the approved order and verifies COMPLETED status and amount before recording settlement.",
                  complete: settledCount > 0,
                },
              ].map((item, index) => (
                <div key={item.stage} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border text-[9px]",
                        item.complete
                          ? "border-teal/40 bg-teal/10 text-teal"
                          : "border-amber/40 bg-amber/10 text-amber",
                      )}
                    >
                      {item.complete ? <ShieldCheck className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    </span>
                    {index < 3 ? <span className="mt-1 h-full w-px bg-line" /> : null}
                  </div>
                  <div className="pb-3">
                    <p className="text-[12px] text-ink">{item.title}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-ink-muted">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1 rounded-lg border border-line bg-surface-input p-3 text-[10px] leading-4 text-ink-muted">
              A policy-approved transaction is never presented as a completed payment. Settlement
              requires a verified PayPal capture.
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="label-mono text-[8px]">Settled via PayPal</p>
              <p className="mono-value mt-2 text-[18px] text-teal">
                {formatCurrency(settled._sum.amount ?? 0, "USD")}
              </p>
              <p className="mt-1 text-[10px] text-ink-muted">captured and verified</p>
            </Card>
            <Card className="p-4">
              <p className="label-mono text-[8px]">Awaiting settlement</p>
              <p className="mono-value mt-2 text-[18px] text-amber">{pending}</p>
              <p className="mt-1 text-[10px] text-ink-muted">buyer approval or capture</p>
            </Card>
          </div>

          <Card>
            <CardHeader title="Pending step-up approvals" description="Owner approval is bound to one proposal and expires in 15 minutes." />
            {approvalRows.length > 0 ? (
              <div className="mt-3 space-y-2">
                {approvalRows.map((approval) => (
                  <div
                    key={approval.approvalId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber/25 bg-amber/5 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="mono-value text-[10px] text-amber">{approval.approvalId}</p>
                      <p className="text-[10px] text-ink-muted">
                        expires {formatDateTime(approval.expiresAt)}
                      </p>
                    </div>
                    <ApprovalActions approvalId={approval.approvalId} proposalId={approval.proposalId} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-ink-muted">
                No proposals are waiting for owner approval.
              </p>
            )}
          </Card>
        </div>
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
          <CardHeader
            title="Recent payments &amp; captures"
            description="Every row originates from the authorization ledger."
          />
          <Link href="/transactions" className="flex items-center gap-1 text-[11px] text-teal hover:underline">
            Full transaction ledger <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        {transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[12px]">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-2 font-medium">Transaction &amp; merchant</th>
                  <th className="px-3 py-2 font-medium">Mandate</th>
                  <th className="px-3 py-2 font-medium">PayPal capture</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b border-line-soft/70 last:border-0">
                    <td className="px-5 py-3">
                      <span className="block text-ink">{transaction.merchantName}</span>
                      <span className="mono-value block text-[9px] text-ink-muted">
                        {transaction.transactionId}
                      </span>
                    </td>
                    <td className="mono-value px-3 py-3 text-[10px] text-ink-secondary">
                      {transaction.mandate.mandateId}
                    </td>
                    <td className="mono-value px-3 py-3 text-[10px] text-ink-muted">
                      {transaction.paypalCaptureId ?? "—"}
                    </td>
                    <td className="mono-value px-3 py-3 text-right text-ink">
                      {formatCurrency(transaction.amount, transaction.currency)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={transaction.status} />
                    </td>
                    <td className="mono-value px-3 py-3 text-[9px] text-ink-muted">
                      {formatDateTime(transaction.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <TransactionActions
                        transactionId={transaction.transactionId}
                        status={transaction.status}
                        paypalOrderId={transaction.paypalOrderId}
                        failureCode={transaction.failureCode}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <EmptyState
              icon={<Wallet className="h-4 w-4" />}
              title="No payments yet"
              description="Authorize a proposal above. The reserved transaction will appear here and can be sent to PayPal checkout."
            />
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Recent proposals" description="Signed agent intent, including rejected proposals." />
          {proposals.length > 0 ? (
            <div className="mt-3 divide-y divide-line-soft">
              {proposals.slice(0, 6).map((proposal) => (
                <div key={proposal.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] text-ink">
                      {proposal.merchantName} · {formatCurrency(proposal.amount, proposal.currency)}
                    </p>
                    <p className="mono-value text-[9px] text-ink-muted">
                      {proposal.proposalId} · {proposal.agent.name}
                    </p>
                  </div>
                  <StatusBadge status={proposal.status} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState className="mt-3 border-0 py-6" title="No proposals" description="Proposals generated by the agent console will be listed here." />
          )}
        </Card>

        <Card>
          <CardHeader title="PayPal integration boundary" description="Server-only credentials and verified webhooks." />
          <div className="mt-3 space-y-2 text-[11px]">
            {[
              ["OAuth token handling", "server-side, cached in process memory"],
              ["Order creation", "POST /v2/checkout/orders with PayPal-Request-Id"],
              ["Buyer approval", "redirect to paypal.com checkout"],
              ["Capture", "POST /v2/checkout/orders/{id}/capture"],
              ["Webhook verification", "verify-webhook-signature with PAYPAL_WEBHOOK_ID"],
              ["Webhook dedup", "unique event id, retries increment attempts"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 border-b border-line-soft pb-2 last:border-0 last:pb-0">
                <span className="flex items-center gap-1.5 text-ink-muted">
                  <CheckCircle2 className="h-3 w-3 text-teal" />
                  {label}
                </span>
                <span className="mono-value max-w-[230px] text-right text-[10px] text-ink-secondary">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface-input p-3 text-[10px] leading-4 text-ink-muted">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
            The client secret is never sent to the browser. Browser code can only request a server
            operation, which revalidates the session, CSRF token and mandate state.
          </div>
          <Link href="/settings" className="mt-3 inline-flex items-center gap-1 text-[11px] text-teal hover:underline">
            View integration configuration <ExternalLink className="h-3 w-3" />
          </Link>
        </Card>
      </div>
    </div>
  );
}
