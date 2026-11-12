export function PageSkeleton({ cards = 4, rows = 3 }: { cards?: number; rows?: number }) {
  return (
    <div className="animate-pulse space-y-5" aria-label="Loading" aria-busy="true">
      <div className="space-y-2">
        <div className="h-2.5 w-24 rounded bg-surface-input" />
        <div className="h-7 w-64 rounded bg-surface-input" />
        <div className="h-3 w-full max-w-xl rounded bg-surface-input" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, index) => (
          <div key={index} className="h-24 rounded-xl border border-line bg-surface p-5">
            <div className="h-2 w-20 rounded bg-surface-input" />
            <div className="mt-4 h-5 w-16 rounded bg-surface-input" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="h-[320px] rounded-xl border border-line bg-surface" />
        <div className="space-y-2 rounded-xl border border-line bg-surface p-5">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="h-12 rounded bg-surface-input" />
          ))}
        </div>
      </div>
    </div>
  );
}
