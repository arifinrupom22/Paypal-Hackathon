
import { requireApiAuth } from "@/lib/auth/guards";
import { clientKey, enforceRateLimit, ok, withApi } from "@/lib/api/response";
import { cancelTransaction } from "@/lib/services/payments";

export const runtime = "nodejs";

export const POST = withApi<{ params: Promise<{ id: string }> }>(async (request, next) => {
  const auth = await requireApiAuth(request);
  const { id } = await next.params;
  enforceRateLimit(clientKey(request, "paypal-cancel"), 20, 60_000);
  const transaction = await cancelTransaction({
    ownerId: auth.userId,
    transactionId: id,
    actorId: auth.userId,
    actorLabel: auth.user.name,
  });
  return ok({ transactionId: transaction.transactionId, status: transaction.status });
});
