"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Loader2, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { relativeTime } from "@/lib/utils";

interface AuditEvent {
  eventId: string;
  action: string;
  summary: string;
  actorLabel: string;
  createdAt: string;
}

export function Notifications() {
  const [open, setOpen] = React.useState(false);
  const [events, setEvents] = React.useState<AuditEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ events: AuditEvent[] }>("/api/audit?page=1&pageSize=5");
      setEvents(data.events);
    } catch {
      setError("Recent security events could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open && events === null && !loading) void load();
  }, [open, events, loading, load]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg border border-line bg-surface p-2 text-ink-secondary hover:text-ink"
        aria-label="Security notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-4 w-4" />
        {events && events.length > 0 ? (
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-teal" />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Recent security activity"
          className="absolute right-0 top-full z-40 mt-2 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[12px] font-medium text-ink">Recent security activity</p>
            <span className="mono-value text-[9px] text-ink-muted">Hash-chained</span>
          </div>

          <div className="max-h-[340px] overflow-y-auto">
            {loading ? (
              <p className="flex items-center gap-2 px-4 py-6 text-[11px] text-ink-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading audit events…
              </p>
            ) : error ? (
              <div className="space-y-2 px-4 py-5">
                <p className="flex items-start gap-2 text-[11px] leading-4 text-crimson">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                </p>
                <button type="button" onClick={() => void load()} className="text-[11px] text-teal hover:underline">
                  Try again
                </button>
              </div>
            ) : events && events.length > 0 ? (
              <ul className="divide-y divide-line-soft">
                {events.map((event) => (
                  <li key={event.eventId}>
                    <Link
                      href="/audit"
                      onClick={() => setOpen(false)}
                      className="block px-4 py-3 transition-colors hover:bg-surface-raised"
                    >
                      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-teal">
                        {event.action.replace(/_/g, " ")}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-ink-secondary">{event.summary}</p>
                      <p className="mono-value mt-1 text-[9px] text-ink-muted">
                        {event.actorLabel} · {relativeTime(event.createdAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-[11px] text-ink-muted">
                No audit events yet. Signing a mandate or running a scenario records one here.
              </p>
            )}
          </div>

          <Link
            href="/audit"
            onClick={() => setOpen(false)}
            className="block border-t border-line bg-surface-input px-4 py-2.5 text-[11px] text-teal hover:underline"
          >
            Open the full audit ledger →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
