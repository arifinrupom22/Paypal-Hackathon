"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/empty-state";
import { ApiClientError, apiFetch } from "@/lib/client/api";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const payload =
      mode === "register"
        ? {
            name: String(form.get("name") ?? ""),
            email: String(form.get("email") ?? ""),
            organization: String(form.get("organization") ?? ""),
            password: String(form.get("password") ?? ""),
          }
        : {
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          };

    try {
      await apiFetch(`/api/auth/${mode}`, { json: payload });
      router.push("/");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
        const details = caught.details as { issues?: { path: string; message: string }[] } | undefined;
        if (details?.issues) {
          setFieldErrors(
            Object.fromEntries(details.issues.map((issue) => [issue.path, issue.message])),
          );
        }
      } else {
        setError("Could not reach the authorization service. Try again.");
      }
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center gap-3 lg:hidden">
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-teal/40 bg-teal/10 text-[11px] font-semibold text-teal">
          PC
        </span>
        <span>
          <span className="block text-[15px] font-semibold tracking-[0.16em] text-ink">PACT</span>
          <span className="label-mono text-[8px]">ZERO-TRUST LAYER</span>
        </span>
      </div>

      <span className="label-mono">{mode === "login" ? "Enclave access" : "Provision account"}</span>
      <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.025em] text-ink">
        {mode === "login" ? "Sign in to your enclave" : "Create your authorization enclave"}
      </h1>
      <p className="mt-2 text-[13px] leading-5 text-ink-secondary">
        {mode === "login"
          ? "Access mandates, agent permissions and the payment authorization ledger."
          : "Set up an owner identity. Mandates you sign are bound to this account and its agents."}
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        {mode === "register" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
              <Input id="name" name="name" autoComplete="name" placeholder="Kiran Patel" required />
            </Field>
            <Field label="Organization" htmlFor="organization" error={fieldErrors.organization}>
              <Input id="organization" name="organization" placeholder="Apex Systems" />
            </Field>
          </div>
        ) : null}

        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={fieldErrors.password}
          hint={mode === "register" ? "At least 12 characters. Stored as a scrypt hash." : undefined}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            placeholder="••••••••••••"
            required
          />
        </Field>

        {error ? <Notice tone="error">{error}</Notice> : null}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {pending ? "Establishing session…" : mode === "login" ? "Enter enclave" : "Create account"}
          {!pending ? <ArrowRight className="h-4 w-4" /> : null}
        </Button>
      </form>

      <p className="mt-6 text-[12px] text-ink-secondary">
        {mode === "login" ? "No account yet? " : "Already have an enclave? "}
        <Link
          href={mode === "login" ? "/register" : "/login"}
          className="text-teal underline-offset-4 hover:underline"
        >
          {mode === "login" ? "Create one" : "Sign in"}
        </Link>
      </p>
      <p className="mt-6 border-t border-line pt-4 text-[10px] leading-4 text-ink-muted">
        Sessions are opaque server-side tokens in httpOnly cookies. Passwords are hashed with scrypt.
        Requests that mutate state require a CSRF token bound to your session.
      </p>
    </div>
  );
}
