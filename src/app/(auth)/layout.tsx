import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();
  if (auth) redirect("/");

  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-canvas p-12 lg:flex">
        <div className="grid-backdrop absolute inset-0 opacity-40" />
        <div
          className="absolute -left-24 top-1/3 h-[420px] w-[420px] rounded-full blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(20,214,176,0.16), transparent 70%)" }}
        />
        <div className="relative">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-teal/40 bg-teal/10 text-[12px] font-semibold text-teal">
              PC
            </span>
            <span>
              <span className="block text-lg font-semibold tracking-[0.18em] text-ink">PACT</span>
              <span className="label-mono text-[9px] tracking-[0.24em]">ZERO-TRUST LAYER</span>
            </span>
          </Link>
        </div>

        <div className="relative max-w-xl">
          <span className="pill border-teal/30 bg-teal/5 text-teal">
            <ShieldCheck className="h-3 w-3" />
            The permission layer for AI payments
          </span>
          <h1 className="mt-6 text-[40px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
            AI proposes.
            <br />
            PACT verifies.
            <br />
            <span className="text-teal">You authorize.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[14px] leading-6 text-ink-secondary">
            Cryptographically signed spending mandates, deterministic policy enforcement and
            PayPal settlement — an independent authorization boundary between autonomous agents
            and your money.
          </p>
          <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
            {[
              { label: "Mandate signing", value: "Ed25519" },
              { label: "Policy checks", value: "deterministic" },
              { label: "Settlement", value: "PayPal v2" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-line bg-surface/70 p-3">
                <p className="label-mono text-[8px]">{item.label}</p>
                <p className="mono-value mt-1.5 text-[13px] text-ink">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-[10px] text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" />
          Authorization is never inferred from model output.
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  );
}
