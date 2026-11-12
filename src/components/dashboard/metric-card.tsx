import { ArrowUpRight } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  suffix,
  detail,
  progress,
  icon: Icon,
  tone = "teal",
}: {
  label: string;
  value: string;
  suffix?: string;
  detail: string;
  progress?: { value: number; label: string; tone?: "teal" | "amber" | "crimson" };
  icon: LucideIcon;
  tone?: "teal" | "amber" | "crimson";
}) {
  const toneClass =
    tone === "amber" ? "text-amber" : tone === "crimson" ? "text-crimson" : "text-teal";

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="label-mono text-[10px]">{label}</p>
        <Icon className={cn("h-4 w-4", toneClass)} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
          {value}
        </span>
        {suffix ? <span className="text-[12px] text-ink-muted">{suffix}</span> : null}
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-secondary">
        <ArrowUpRight className="h-3 w-3 text-ink-muted" />
        {detail}
      </p>
      {progress ? (
        <div className="mt-3 space-y-1.5">
          <ProgressBar value={progress.value} tone={progress.tone} />
          <p className="label-mono text-[9px]">{progress.label}</p>
        </div>
      ) : null}
    </div>
  );
}
