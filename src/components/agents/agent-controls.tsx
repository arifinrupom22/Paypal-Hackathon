"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PauseCircle, PlayCircle, PlusCircle, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/empty-state";
import { ApiClientError, apiFetch } from "@/lib/client/api";

export function RegisterAgentDialog({
  roots,
  triggerLabel = "Register Agent",
}: {
  roots: { id: string; name: string }[];
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/api/agents", {
        json: {
          name: String(form.get("name") ?? ""),
          description: String(form.get("description") ?? ""),
          parentAgentId: String(form.get("parentAgentId") ?? "") || null,
        },
      });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Agent registration failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <PlusCircle className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Register an agent identity"
        description="PACT generates a dedicated Ed25519 key pair. The private half is encrypted at rest and never leaves the server."
        className="max-w-lg"
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Agent name" htmlFor="agent-name">
            <Input id="agent-name" name="name" required placeholder="ProcureMaster-Root" maxLength={80} />
          </Field>
          <Field label="Parent agent" htmlFor="agent-parent" hint="Child agents inherit a strictly bounded subset of authority.">
            <Select id="agent-parent" name="parentAgentId" defaultValue="">
              <option value="">None — sovereign root identity</option>
              {roots.map((root) => (
                <option key={root.id} value={root.id}>
                  {root.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Purpose" htmlFor="agent-description">
            <Textarea
              id="agent-description"
              name="description"
              maxLength={400}
              placeholder="Autonomous cloud procurement under delegated mandates"
            />
          </Field>

          <Notice tone="info">
            The agent can only propose purchases. It cannot sign mandates, modify permissions, read
            private keys or capture payments directly.
          </Notice>

          {error ? <Notice tone="error">{error}</Notice> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
              Issue identity
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AgentStateButton({
  agentId,
  status,
  compact = false,
}: {
  agentId: string;
  status: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const suspended = status === "SUSPENDED";

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/agents/${agentId}/suspend`, {
        json: { action: suspended ? "RESUME" : "SUSPEND" },
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "State change failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={suspended ? "secondary" : "destructive"}
        size={compact ? "sm" : "md"}
        onClick={toggle}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : suspended ? (
          <PlayCircle className="h-3.5 w-3.5" />
        ) : (
          <PauseCircle className="h-3.5 w-3.5" />
        )}
        {suspended ? "Resume" : "Suspend"}
      </Button>
      {error ? <span className="max-w-[220px] text-right text-[10px] text-crimson">{error}</span> : null}
    </div>
  );
}
