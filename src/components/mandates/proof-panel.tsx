"use client";

import * as React from "react";
import { Download, ShieldCheck, ShieldX } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";

export function ProofPanel({
  mandateId,
  payload,
  signature,
  canonicalHash,
  signingKeyId,
  algorithm,
  publicKeyFingerprint,
  publicKeyBase64,
  status,
  expiresAt,
  revokedAt,
  proof,
}: {
  mandateId: string;
  payload: Record<string, unknown>;
  signature: string;
  canonicalHash: string;
  signingKeyId: string;
  algorithm: string;
  publicKeyFingerprint: string;
  publicKeyBase64: string;
  status: string;
  expiresAt: string;
  revokedAt: string | null;
  proof: { valid: boolean; signatureValid: boolean; hashValid: boolean; keyMatches: boolean };
}) {
  const json = JSON.stringify(payload, null, 2);

  function download() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${mandateId}.mandate.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <ShieldCheck className="h-4 w-4 text-teal" />
            Cryptographic proof
          </h2>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Re-derived from stored columns and verified with the platform public key.
          </p>
        </div>
        <span
          className={cn(
            "pill",
            proof.valid
              ? "border-teal/40 bg-teal/10 text-teal"
              : "border-crimson/40 bg-crimson/10 text-crimson",
          )}
        >
          {proof.valid ? <ShieldCheck className="h-3 w-3" /> : <ShieldX className="h-3 w-3" />}
          {proof.valid ? "Signature valid" : "Verification failed"}
        </span>
      </div>

      <div className="space-y-3 p-5">
        <div className="space-y-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-muted">Mandate identifier</span>
            <span className="mono-value flex min-w-0 max-w-[68%] items-center gap-2 text-ink">
              <span className="min-w-0 truncate">{mandateId}</span>
              <CopyButton value={mandateId} label="Copy" className="shrink-0" />
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-muted">Algorithm</span>
            <span className="mono-value text-ink">{algorithm}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-muted">Signing key</span>
            <span className="mono-value text-ink">{signingKeyId}</span>
          </div>
          <div className="min-w-0 space-y-1">
            <span className="text-ink-muted">Public key fingerprint</span>
            <div className="mono-value flex min-w-0 items-start gap-2 text-ink">
              <span className="min-w-0 flex-1 whitespace-normal break-all">{publicKeyFingerprint}</span>
              <CopyButton value={publicKeyFingerprint} label="Copy" className="shrink-0" />
            </div>
          </div>
          <div className="min-w-0 space-y-1">
            <span className="text-ink-muted">Public key (SPKI)</span>
            <div className="mono-value flex min-w-0 items-center gap-2 text-ink">
              <span className="min-w-0 flex-1 truncate">{publicKeyBase64.slice(0, 36)}…</span>
              <CopyButton value={publicKeyBase64} label="Copy" className="shrink-0" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-muted">Mandate status</span>
            <span className="mono-value text-ink">{status}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-muted">Expiration</span>
            <span className="mono-value text-ink">{formatDateTime(expiresAt)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-ink-muted">Revocation state</span>
            <span className={cn("mono-value text-right", revokedAt ? "text-crimson" : "text-emerald")}>
              {revokedAt ? `Revoked ${formatDateTime(revokedAt)}` : "Not revoked"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-muted">Canonical hash</span>
            <span className="mono-value flex min-w-0 max-w-[68%] items-center gap-2 text-ink">
              <span className="min-w-0 truncate">{canonicalHash}</span>
              <CopyButton value={canonicalHash} label="Copy" className="shrink-0" />
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-muted">Signature</span>
            <span className="mono-value flex min-w-0 max-w-[68%] items-center gap-2 text-ink">
              <span className="min-w-0 truncate">{signature}</span>
              <CopyButton value={signature} label="Copy" className="shrink-0" />
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-muted">Verification</span>
            <span className="mono-value text-ink-secondary">
              signature {proof.signatureValid ? "✓" : "✗"} · hash {proof.hashValid ? "✓" : "✗"} · key{" "}
              {proof.keyMatches ? "✓" : "✗"}
            </span>
          </div>
          <p className="rounded border border-line bg-surface-input px-2.5 py-2 text-[9px] leading-4 text-ink-muted">
            Only public verification material is displayed. The platform private key is never sent to
            the browser or included in exports.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface-input">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="label-mono text-[8px]">Canonical mandate payload (JSON)</span>
            <CopyButton value={json} label="Copy JSON" />
          </div>
          <pre className="max-h-[230px] overflow-auto p-3 font-mono text-[10.5px] leading-5 text-ink-secondary">
            {json}
          </pre>
        </div>

        <Button variant="secondary" size="sm" onClick={download} className="w-full">
          <Download className="h-3.5 w-3.5" />
          Download signed mandate
        </Button>
      </div>
    </div>
  );
}
