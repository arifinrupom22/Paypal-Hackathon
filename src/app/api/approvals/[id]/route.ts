import { z } from "zod";
import { requireApiAuth } from "@/lib/auth/guards";
import { ok, withApi } from "@/lib/api/response";
import { approveProposal } from "@/lib/services/policy";

export const runtime = "nodejs";

const bodySchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]) });

export const POST = withApi<{ params: Promise<{ id: string }> }>(async (request, next) => {
  const auth = await requireApiAuth(request);
  const { id } = await next.params;
  const body = bodySchema.parse(await request.json());

  const approval = await approveProposal({
    ownerId: auth.userId,
    approvalId: id,
    actorId: auth.userId,
    actorLabel: auth.user.name,
    decision: body.decision,
  });

  return ok({
    approvalId: approval.approvalId,
    status: approval.status,
    proposalId: approval.proposalId,
    expiresAt: approval.expiresAt,
  });
});
