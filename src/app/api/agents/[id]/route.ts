import { requireApiAuth } from "@/lib/auth/guards";
import { ok, withApi } from "@/lib/api/response";
import { AppError } from "@/lib/errors";
import { getAgentDetail } from "@/lib/services/agents";

export const runtime = "nodejs";

export const GET = withApi<{ params: Promise<{ id: string }> }>(async (request, next) => {
  const auth = await requireApiAuth(request);
  const { id } = await next.params;
  const detail = await getAgentDetail(auth.userId, id);
  if (!detail) throw new AppError("AGENT_NOT_FOUND", "Agent not found.", 404);

  return ok({
    agent: {
      id: detail.agent.id,
      name: detail.agent.name,
      description: detail.agent.description,
      tier: detail.agent.tier,
      status: detail.agent.status,
      parentAgentId: detail.agent.parentAgentId,
      publicKey: detail.agent.publicKey,
      keyFingerprint: detail.agent.keyFingerprint,
      createdAt: detail.agent.createdAt,
      lastActiveAt: detail.agent.lastActiveAt,
    },
    mandates: detail.agent.mandates.map((mandate) => ({
      id: mandate.id,
      mandateId: mandate.mandateId,
      title: mandate.title,
      status: mandate.status,
      maxTotal: String(mandate.maxTotal),
      maxPerTransaction: String(mandate.maxPerTransaction),
      maxTransactions: mandate.maxTransactions,
      expiresAt: mandate.expiresAt,
      spend: detail.spendMap.get(mandate.id)?.amount ?? "0.00",
      transactionCount: detail.spendMap.get(mandate.id)?.count ?? 0,
      scopes: mandate.scopes,
    })),
    children: detail.agent.children.map((child) => ({
      id: child.id,
      name: child.name,
      description: child.description,
      tier: child.tier,
      status: child.status,
      parentAgentId: child.parentAgentId,
      publicKey: child.publicKey,
      keyFingerprint: child.keyFingerprint,
      createdAt: child.createdAt,
    })),
    transactions: detail.transactions,
    decisions: detail.decisions,
    auditEvents: detail.auditEvents,
  });
});
