import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { clientKey, enforceRateLimit, ok, withApi } from "@/lib/api/response";
import { createOrderSchema } from "@/lib/validation/schemas";
import { createOrderForTransaction } from "@/lib/services/payments";

export const runtime = "nodejs";

export const POST = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);
  enforceRateLimit(clientKey(request, "paypal-order"), 20, 60_000);
  const payload = createOrderSchema.parse(await request.json());

  const order = await createOrderForTransaction({
    ownerId: auth.userId,
    transactionId: payload.transactionId,
    actorId: auth.userId,
    actorLabel: auth.user.name,
  });

  return ok(order);
});
