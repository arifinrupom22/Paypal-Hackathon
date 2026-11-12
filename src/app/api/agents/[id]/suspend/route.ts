import { z } from "zod";
import { requireApiAuth } from "@/lib/auth/guards";
import { ok, withApi } from "@/lib/api/response";
import { resumeAgent, suspendAgent } from "@/lib/services/agents";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.object({ action: z.enum(["SUSPEND", "RESUME"]) });

export const POST = withApi<{ params: Promise<{ id: string }> }>(async (request, next) => {
  const auth = await requireApiAuth(request);
  const { id } = await next.params;
  const body = bodySchema.parse(await request.json());

  if (body.action === "SUSPEND") {
    if (id === auth.userId) throw new AppError("INVALID_TARGET", "Invalid agent.", 422);
    const agent = await suspendAgent({
      ownerId: auth.userId,
      agentId: id,
      actorId: auth.userId,
      actorLabel: auth.user.name,
    });
    return ok({ agent: { id: agent.id, status: agent.status } });
  }

  const agent = await resumeAgent({
    ownerId: auth.userId,
    agentId: id,
    actorId: auth.userId,
    actorLabel: auth.user.name,
  });
  return ok({ agent: { id: agent.id, status: agent.status } });
});
