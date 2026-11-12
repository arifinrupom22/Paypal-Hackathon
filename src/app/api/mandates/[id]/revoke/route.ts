
import { requireApiAuth } from "@/lib/auth/guards";
import { ok, withApi } from "@/lib/api/response";
import { revokeSchema } from "@/lib/validation/schemas";
import { revokeMandate } from "@/lib/services/mandates";

export const runtime = "nodejs";

export const POST = withApi<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const auth = await requireApiAuth(request);
  const { id } = await params;
  const payload = revokeSchema.parse(await request.json().catch(() => ({})));

  const result = await revokeMandate({
    ownerId: auth.userId,
    mandateId: id,
    actorId: auth.userId,
    actorLabel: auth.user.name,
    reason: payload.reason || undefined,
  });

  return ok(result);
});
