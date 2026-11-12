import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-input text-ink-muted">
        {icon ?? <Info className="h-4 w-4" />}
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-md text-[13px] leading-5 text-ink-secondary">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "error";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-line bg-surface-input text-ink-secondary",
    success: "border-emerald/30 bg-emerald/5 text-emerald",
    warning: "border-amber/30 bg-amber/5 text-amber",
    error: "border-crimson/30 bg-crimson/5 text-crimson",
  } as const;
  const icons = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    error: AlertTriangle,
  } as const;
  const Icon = icons[tone];
  return (
    <div className={cn("flex gap-3 rounded-lg border p-3 text-[12px] leading-5", tones[tone], className)}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={title ? "text-ink-secondary" : undefined}>{children}</div>
      </div>
    </div>
  );
}

export function ProofBadge({ valid, label }: { valid: boolean; label?: string }) {
  return (
    <span className="pill border-teal/40 bg-surface text-teal" title="Ed25519 signature verification result">
      <ShieldCheck className="h-3 w-3" />
      {label ?? (valid ? "ED25519:VERIFIED" : "SIGNATURE INVALID")}
    </span>
  );
}
