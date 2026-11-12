import { CheckCircle2, CircleSlash, Cpu, CreditCard, Database, KeyRound, ShieldCheck } from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { platformKeys } from "@/lib/crypto/keys";
import { paypalStatus } from "@/lib/paypal";
import { isGeminiConfigured, GEMINI_MODEL } from "@/lib/ai/gemini";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { SessionControls } from "@/components/settings/session-controls";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const auth = await requirePageAuth();
  const keys = platformKeys();
  const paypal = paypalStatus();
  const gemini = isGeminiConfigured();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const sessions = await db.session.findMany({
    where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const integrations = [
    {
      label: "PayPal REST Orders v2",
      configured: paypal.configured,
      detail: paypal.configured ? `${paypal.environment} · ${paypal.baseUrl}` : "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET",
      icon: CreditCard,
    },
    {
      label: "PayPal webhook verification",
      configured: paypal.webhookConfigured,
      detail: paypal.webhookConfigured ? `${appUrl}/api/webhooks/paypal` : "PAYPAL_WEBHOOK_ID",
      icon: ShieldCheck,
    },
    {
      label: "Gemini intent extraction",
      configured: gemini,
      detail: gemini ? GEMINI_MODEL : "GEMINI_API_KEY (deterministic fallback active)",
      icon: Cpu,
    },
    {
      label: "PostgreSQL persistence",
      configured: Boolean(process.env.DATABASE_URL),
      detail: "Prisma ORM · NUMERIC(18,2) financial columns",
      icon: Database,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <span className="pill border-line bg-surface-input text-ink-muted">
          <KeyRound className="h-3 w-3 text-teal" />
          Enclave configuration
        </span>
        <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-ink">Settings</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-secondary">
          Owner identity, signing key posture, integration readiness and session controls.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Owner identity" description="The authenticated principal that owns every mandate and agent." />
          <div className="mt-4 space-y-2 text-[11px]">
            {[
              ["Name", auth.user.name],
              ["Email", auth.user.email],
              ["Organization", auth.user.organization ?? "—"],
              ["Session expires", formatDateTime(auth.expiresAt)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-line-soft pb-2 last:border-0">
                <span className="text-ink-muted">{label}</span>
                <span className="mono-value text-ink">{value}</span>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <p className="label-mono text-[8px]">Security posture</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[
                "scrypt password hashing (N=16384)",
                "Opaque httpOnly session tokens",
                "CSRF token bound to session",
                "Rate limiting on sensitive routes",
                "Same-origin enforcement on mutations",
                "Server-side validation with Zod",
              ].map((item) => (
                <p key={item} className="flex items-start gap-1.5 text-[10px] leading-4 text-ink-secondary">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-teal" />
                  {item}
                </p>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Signing key" description="Server-held Ed25519 key used to sign mandates and audit records." />
          <div className="mt-4 flex items-center justify-between rounded-lg border border-teal/25 bg-teal/5 p-3">
            <div>
              <p className="mono-value text-[12px] text-teal">{keys.keyId}</p>
              <p className="mt-0.5 text-[10px] text-ink-muted">Ed25519 (RFC 8032) · PKCS#8</p>
            </div>
            <Badge tone="teal">Active</Badge>
          </div>
          <div className="mt-3 space-y-2 text-[10px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-muted">Fingerprint</span>
              <span className="mono-value break-all text-right text-ink">{keys.fingerprint.slice(0, 32)}…</span>
            </div>
            <div>
              <p className="text-ink-muted">Public key (SPKI, base64)</p>
              <div className="mt-1 flex items-start gap-2 rounded border border-line bg-surface-input p-2">
                <span className="mono-value min-w-0 flex-1 break-all text-[9px] leading-4 text-ink-secondary">
                  {keys.publicKeyBase64}
                </span>
                <CopyButton value={keys.publicKeyBase64} label="Copy" />
              </div>
            </div>
            <p className="flex items-start gap-1.5 pt-1 text-[9px] leading-4 text-amber">
              <CircleSlash className="mt-0.5 h-3 w-3 shrink-0" />
              The private key is loaded only from the server environment and is never exposed by any
              API response, client bundle or log line.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Integration readiness" description="External operations are enabled only when their credentials are present." />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {integrations.map((integration) => {
            const Icon = integration.icon;
            return (
              <div key={integration.label} className="flex items-start gap-3 rounded-lg border border-line bg-surface-input p-3">
                <Icon className="mt-0.5 h-4 w-4 text-ink-muted" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] text-ink">{integration.label}</p>
                    <Badge tone={integration.configured ? "teal" : "amber"}>
                      {integration.configured ? "Ready" : "Setup"}
                    </Badge>
                  </div>
                  <p className="mono-value mt-1 break-all text-[9px] text-ink-muted">{integration.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 rounded-lg border border-line bg-surface-input p-3">
          <p className="label-mono text-[8px]">Environment variables</p>
          <p className="mono-value mt-1 text-[10px] leading-5 text-ink-secondary">
            DATABASE_URL · GEMINI_API_KEY · PAYPAL_CLIENT_ID · PAYPAL_CLIENT_SECRET ·
            PAYPAL_ENVIRONMENT · PAYPAL_WEBHOOK_ID · PACT_PRIVATE_KEY · PACT_PUBLIC_KEY · AUTH_SECRET
          </p>
          <p className="mt-1 text-[10px] text-ink-muted">
            Values are never rendered in the interface. Seal them in .env.local or your host&apos;s
            secret store.
          </p>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Active sessions" description="Opaque server-side tokens for this account." />
          <div className="mt-3 space-y-2">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between rounded-lg border border-line bg-surface-input px-3 py-2 text-[10px]">
                <div>
                  <p className="mono-value text-ink">{session.id.slice(0, 16)}…</p>
                  <p className="text-ink-muted">{session.userAgent?.slice(0, 48) ?? "unknown client"}</p>
                </div>
                <span className="mono-value text-ink-muted">{formatDateTime(session.createdAt)}</span>
              </div>
            ))}
            {sessions.length === 0 ? <p className="text-[11px] text-ink-muted">No active sessions.</p> : null}
          </div>
          <div className="mt-5 border-t border-line-soft pt-4">
            <SessionControls />
          </div>
        </Card>

        <Card>
          <CardHeader title="Webhook endpoint" description="Register this URL in the PayPal developer dashboard." />
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-surface-input p-2.5">
            <span className="mono-value min-w-0 flex-1 break-all text-[10px] text-ink-secondary">
              {appUrl}/api/webhooks/paypal
            </span>
            <CopyButton value={`${appUrl}/api/webhooks/paypal`} label="Copy" />
          </div>
          <p className="mt-3 text-[10px] leading-4 text-ink-muted">
            PACT verifies the PayPal transmission signature with your webhook ID before mutating any
            transaction, then deduplicates by event ID. Unverified events are recorded as rejected and
            never settle a payment.
          </p>
          <div className="mt-3 space-y-1.5 text-[10px]">
            <p className="flex items-center justify-between">
              <span className="text-ink-muted">Verification</span>
              <span className={paypal.webhookConfigured ? "text-teal" : "text-amber"}>
                {paypal.webhookConfigured ? "Enabled" : "PAYPAL_WEBHOOK_ID missing"}
              </span>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-ink-muted">Deduplication</span>
              <span className="text-ink">unique event ID</span>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-ink-muted">Event handler</span>
              <span className="text-ink">capture completed / denied / refunded</span>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
