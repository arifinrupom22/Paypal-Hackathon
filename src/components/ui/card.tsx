import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-line bg-surface p-6", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[17px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
          {meta}
        </div>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function PanelLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("label-mono", className)}>{children}</span>;
}
