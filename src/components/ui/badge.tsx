import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "teal" | "emerald" | "amber" | "crimson" | "slate" | "violet";

const TONES: Record<Tone, string> = {
  teal: "border-teal/35 bg-teal/10 text-teal",
  emerald: "border-emerald/30 bg-emerald/10 text-emerald",
  amber: "border-amber/30 bg-amber/10 text-amber",
  crimson: "border-crimson/30 bg-crimson/10 text-crimson",
  slate: "border-ink-muted/25 bg-ink-muted/10 text-ink-secondary",
  violet: "border-violet/30 bg-violet/10 text-violet-soft",
};

export function Badge({
  children,
  tone = "slate",
  className,
  dot,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span className={cn("pill", TONES[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

const OUTCOME_TONES: Record<string, Tone> = {
  AUTHORIZED: "emerald",
  ACTIVE: "teal",
  SETTLED: "emerald",
  VERIFIED: "teal",
  BLOCKED: "crimson",
  REVOKED: "crimson",
  FAILED: "crimson",
  REQUIRES_USER_APPROVAL: "amber",
  REQUIRES_APPROVAL: "amber",
  AWAITING_BUYER_APPROVAL: "amber",
  APPROVAL_REQUIRED: "amber",
  EXPIRED: "slate",
  EXHAUSTED: "amber",
  SUSPENDED: "crimson",
  POLICY_APPROVED: "teal",
  CAPTURING: "amber",
  CANCELLED: "slate",
  REFUNDED: "violet",
  PENDING: "amber",
  COMPLETED: "emerald",
  PROPOSED: "slate",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = OUTCOME_TONES[status] ?? "slate";
  return (
    <Badge tone={tone} className={className}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
