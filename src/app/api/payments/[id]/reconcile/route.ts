import { requireApiAuth } from "@/lib/auth/guards";
import { clientKey, enforceRateLimit, ok, withApi } from "@/lib/api/response";
import { reconcileTransaction } from "@/lib/services/payments";

export const runtime = "nodejs";

export const POST = withApi<{ params: Promise<{ id: string }> }>(async (request, next) => {
  const auth = await requireApiAuth(request);
  const { id } = await next.params;
  enforceRateLimit(clientKey(request, "paypal-reconcile"), 12, 60_000);

  const result = await reconcileTransaction({
    ownerId: auth.userId,
    transactionId: id,
    actorId: auth.userId,
    actorLabel: auth.user.name,
  });

  return ok(result);
});
