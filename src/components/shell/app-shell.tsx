"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bot,
  CreditCard,
  Cpu,
  FileCheck2,
  LayoutGrid,
  LogOut,
  Menu,
  PlusCircle,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Notifications } from "@/components/shell/notifications";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/mandates", label: "Mandate Center", icon: ShieldCheck },
  { href: "/mandates/new", label: "Create Mandate", icon: PlusCircle },
  { href: "/agents", label: "Agent Control Center", icon: Bot },
  { href: "/security", label: "Security Center", icon: ShieldAlert },
  { href: "/payments", label: "Payment Center", icon: CreditCard },
  { href: "/transactions", label: "Transaction Ledger", icon: ScrollText },
  { href: "/audit", label: "Audit & Compliance", icon: FileCheck2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  user,
  signingKeyId,
  paypalConfigured,
  geminiConfigured,
  children,
}: {
  user: { name: string; email: string; organization: string | null };
  signingKeyId: string;
  paypalConfigured: boolean;
  geminiConfigured: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  async function signOut() {
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/logout", { json: {} });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col border-r border-line bg-canvas">
      <Link href="/" className="flex items-center gap-3 border-b border-line px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-teal/40 bg-teal/10 text-[11px] font-semibold text-teal">
          PC
        </span>
        <span>
          <span className="block text-[15px] font-semibold tracking-[0.12em] text-ink">PACT</span>
          <span className="label-mono block text-[8px] tracking-[0.2em]">ZERO-TRUST LAYER</span>
        </span>
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_8px_rgba(20,214,176,0.8)]" />
      </Link>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <p className="label-mono px-3 pb-2 text-[9px]">Execution Core</p>
        <nav className="space-y-0.5">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("nav-item", active && "nav-item-active")}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={cn("h-4 w-4", active ? "text-teal" : "text-ink-muted")} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2 border-t border-line px-4 py-4">
        <p className="label-mono text-[9px]">Crypto Core</p>
        <div className="flex items-center justify-between text-[12px]">
          <span className="flex items-center gap-2 text-ink-secondary">
            <ShieldCheck className="h-3.5 w-3.5 text-teal" />
            Ed25519 Engine
          </span>
          <span className="pill border-teal/30 bg-teal/10 text-teal">Active</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-ink-muted">
          <span className="mono-value truncate">{signingKeyId}</span>
          <span className="h-1.5 w-1.5 rounded-full bg-teal" />
        </div>
        <div className="flex items-center justify-between border-t border-line-soft pt-2 text-[12px]">
          <span className="flex items-center gap-2 text-ink-secondary">
            <CreditCard className="h-3.5 w-3.5 text-ink-muted" />
            PayPal Bridge
          </span>
          <span className={cn("pill", paypalConfigured ? "border-teal/30 bg-teal/10 text-teal" : "border-amber/30 bg-amber/10 text-amber")}>
            {paypalConfigured ? "Online" : "Setup"}
          </span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="flex items-center gap-2 text-ink-secondary">
            <Cpu className="h-3.5 w-3.5 text-ink-muted" />
            Gemini Intent
          </span>
          <span className={cn("pill", geminiConfigured ? "border-teal/30 bg-teal/10 text-teal" : "border-ink-muted/25 bg-ink-muted/10 text-ink-secondary")}>
            {geminiConfigured ? "Linked" : "Local"}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block">{sidebar}</aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-canvas-deep/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[280px]">{sidebar}</aside>
        </div>
      ) : null}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-line bg-canvas/95 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-md border border-line p-2 text-ink-secondary lg:hidden"
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <div className="hidden items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-ink-muted md:flex">
            <span>PACT</span>
            <span className="text-ink-muted/50">/</span>
            <span className="text-ink-secondary">Sovereign Runtime</span>
          </div>

          <span className="hidden items-center gap-2 rounded-full border border-teal/30 bg-teal/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-teal xl:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
            Armed &amp; Monitoring
          </span>

          <form action="/mandates" className="ml-auto hidden max-w-md flex-1 items-center md:flex">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
              <input
                ref={searchRef}
                name="q"
                placeholder="Search mandates by ID, agent or merchant…"
                className="field h-9 pl-9 pr-12 text-[12px]"
                aria-label="Search mandates"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line px-1 font-mono text-[9px] text-ink-muted">
                ⌘K
              </span>
            </div>
          </form>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <span className="hidden items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] text-ink-secondary lg:inline-flex">
              <Cpu className="h-3.5 w-3.5 text-teal" />
              Sandbox Enclave
            </span>
            <ThemeToggle />
            <Notifications />
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-teal/30 bg-teal/10 text-[10px] font-semibold text-teal">
                {initials || "P"}
              </span>
              <span className="hidden leading-tight sm:block">
                <span className="block text-[12px] font-medium text-ink">{user.name}</span>
                <span className="block max-w-[140px] truncate text-[10px] text-ink-muted">
                  {user.organization ?? user.email}
                </span>
              </span>
              <button
                type="button"
                onClick={signOut}
                disabled={loggingOut}
                className="ml-1 rounded p-1 text-ink-muted transition-colors hover:text-crimson"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>

        <footer className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-4 text-[10px] text-ink-muted sm:px-6 lg:px-8">
          <span className="flex items-center gap-2">
            <Activity className="h-3 w-3 text-teal" />
            Deterministic authorization enclave · {signingKeyId}
          </span>
          <span className="mono-value">AI proposes · PACT verifies · User authorizes · PayPal processes</span>
        </footer>
      </div>
    </div>
  );
}
