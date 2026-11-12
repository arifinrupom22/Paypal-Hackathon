import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { clientKey, enforceRateLimit, ok, withApi } from "@/lib/api/response";
import { policyEvaluateSchema } from "@/lib/validation/schemas";
import { evaluateProposal } from "@/lib/services/policy";

export const runtime = "nodejs";

export const POST = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);
  enforceRateLimit(clientKey(request, "policy-evaluate"), 60, 60_000);
  const payload = policyEvaluateSchema.parse(await request.json());

  const result = await evaluateProposal({
    ownerId: auth.userId,
    proposalId: payload.proposalId,
    executionId: payload.executionId,
    idempotencyKey: payload.idempotencyKey,
    approvalId: payload.approvalId ?? null,
    actorId: auth.userId,
    actorLabel: auth.user.name,
  });

  return ok(result);
});
