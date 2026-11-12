import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { clientKey, enforceRateLimit, ok, withApi } from "@/lib/api/response";
import { agentCreateSchema } from "@/lib/validation/schemas";
import { listAgentsForOwner, registerAgent } from "@/lib/services/agents";

export const runtime = "nodejs";

export const GET = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);
  const agents = await listAgentsForOwner(auth.userId);
  return ok({
    agents: agents.map((entry) => ({
      id: entry.agent.id,
      name: entry.agent.name,
      description: entry.agent.description,
      tier: entry.agent.tier,
      status: entry.agent.status,
      parentAgentId: entry.agent.parentAgentId,
      parentName: entry.parentName,
      keyFingerprint: entry.agent.keyFingerprint,
      mandateCount: entry.mandateCount,
      activeMandates: entry.activeMandates,
      spend: entry.spend,
      transactionCount: entry.transactionCount,
      limits: entry.limits,
      createdAt: entry.agent.createdAt,
    })),
  });
});

export const POST = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);
  enforceRateLimit(clientKey(request, "agent-create"), 20, 60_000);
  const payload = agentCreateSchema.parse(await request.json());

  const { agent } = await registerAgent({
    ownerId: auth.userId,
    actorId: auth.userId,
    actorLabel: auth.user.name,
    name: payload.name,
    description: payload.description || undefined,
    parentAgentId: payload.parentAgentId ?? null,
  });

  return ok(
    {
      agent: {
        id: agent.id,
        name: agent.name,
        tier: agent.tier,
        status: agent.status,
        keyFingerprint: agent.keyFingerprint,
        publicKey: agent.publicKey,
      },
    },
    201,
  );
});
