import Link from "next/link";
import { ArrowLeft, GitBranch } from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ACTIVE_TRANSACTION_STATUSES } from "@/lib/domain/constants";
import { formatMoney } from "@/lib/money";
import { DelegationGraph, type GraphAgent } from "@/components/agents/delegation-graph";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DelegationGraphPage() {
  const auth = await requirePageAuth();

  const [agents, spendRows] = await Promise.all([
    db.agent.findMany({
      where: { ownerId: auth.userId },
      include: {
        parentAgent: { select: { name: true } },
        mandates: { include: { scopes: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ tier: "asc" }, { name: "asc" }],
    }),
    db.transaction.groupBy({
      by: ["mandateId"],
      where: { ownerId: auth.userId, status: { in: ACTIVE_TRANSACTION_STATUSES } },
      _sum: { amount: true },
    }),
  ]);

  const spendByMandate = new Map(
    spendRows.map((row) => [row.mandateId, formatMoney(row._sum.amount ?? 0)]),
  );

  const graphAgents: GraphAgent[] = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    tier: agent.tier,
    status: agent.status,
    parentAgentId: agent.parentAgentId,
    parentName: agent.parentAgent?.name ?? null,
    keyFingerprint: agent.keyFingerprint,
    createdAt: agent.createdAt.toISOString(),
    mandates: agent.mandates.map((mandate) => ({
      id: mandate.id,
      mandateId: mandate.mandateId,
      title: mandate.title,
      status: mandate.status,
      currency: mandate.currency,
      maxTotal: formatMoney(mandate.maxTotal),
      maxPerTransaction: formatMoney(mandate.maxPerTransaction),
      spent: spendByMandate.get(mandate.id) ?? "0.00",
      expiresAt: mandate.expiresAt.toISOString(),
      delegationAllowed: mandate.delegationAllowed,
      parentMandateId: mandate.parentMandateId,
      revokedAt: mandate.revokedAt?.toISOString() ?? null,
      scopes: mandate.scopes.map((scope) => ({ type: scope.type, value: scope.value })),
    })),
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/agents" className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink">
          <ArrowLeft className="h-3 w-3" /> Agent Control Center
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-mono text-[8px]">Permission hierarchy</p>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ink">
              Delegation Graph
            </h1>
            <p className="mt-1 max-w-2xl text-[12px] leading-5 text-ink-secondary">
              Signed authority flows from the owner to a root agent, then to child agents. The graph
              compares every delegated mandate with its parent ceiling, expiry and permissions.
            </p>
          </div>
          <span className="pill border-line bg-surface text-ink-muted">
            <GitBranch className="h-3 w-3" /> {graphAgents.length} agents ·{" "}
            {graphAgents.filter((agent) => agent.parentAgentId).length} delegation
            {graphAgents.filter((agent) => agent.parentAgentId).length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <Card className="p-3 sm:p-4">
        <DelegationGraph agents={graphAgents} />
      </Card>

      <p className="text-[10px] leading-4 text-ink-muted">
        Containment is calculated from the signed parent mandate referenced by each child mandate.
        Agent hierarchy alone does not grant budget; the policy engine also verifies the mandate chain,
        agent lineage, currency, scope subset, expiry and remaining parent budget at authorization time.
      </p>
    </div>
  );
}
