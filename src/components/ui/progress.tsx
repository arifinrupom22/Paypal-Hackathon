import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  className,
  tone = "teal",
}: {
  value: number;
  className?: string;
  tone?: "teal" | "amber" | "crimson" | "slate";
}) {
  const tones = {
    teal: "bg-teal",
    amber: "bg-amber",
    crimson: "bg-crimson",
    slate: "bg-ink-muted",
  } as const;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-line-soft", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", tones[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
