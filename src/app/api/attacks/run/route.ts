import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { clientKey, enforceRateLimit, ok, withApi } from "@/lib/api/response";
import { attackRunSchema } from "@/lib/validation/schemas";
import { runAttack } from "@/lib/services/attacks";

export const runtime = "nodejs";

export const POST = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);
  enforceRateLimit(clientKey(request, "attack-run"), 12, 60_000);
  const payload = attackRunSchema.parse(await request.json());

  const { run } = await runAttack({
    ownerId: auth.userId,
    actorId: auth.userId,
    actorLabel: auth.user.name,
    scenario: payload.scenario,
  });

  return ok({ run }, 201);
});
