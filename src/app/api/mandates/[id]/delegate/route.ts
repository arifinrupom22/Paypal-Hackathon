import { requireApiAuth } from "@/lib/auth/guards";
import { ok, withApi } from "@/lib/api/response";
import { delegateSchema } from "@/lib/validation/schemas";
import { createMandate, getMandateDetail } from "@/lib/services/mandates";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

export const POST = withApi<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const auth = await requireApiAuth(request);
  const { id } = await params;
  const payload = delegateSchema.parse(await request.json());

  const parentDetail = await getMandateDetail(auth.userId, id);
  if (!parentDetail) throw new AppError("MANDATE_NOT_FOUND", "Parent mandate not found.", 404);

  const { mandate } = await createMandate({
    ownerId: auth.userId,
    createdById: auth.userId,
    actorLabel: auth.user.name,
    agentId: payload.agentId,
    parentMandateId: parentDetail.mandate.id,
    title: payload.title,
    currency: parentDetail.mandate.currency,
    maxTotal: payload.maxTotal,
    maxPerTransaction: payload.maxPerTransaction,
    maxTransactions: payload.maxTransactions,
    expiresAt: new Date(payload.expiresAt),
    delegationAllowed: false,
    merchants: payload.merchants,
    categories: payload.categories,
  });

  return ok({ mandateId: mandate.mandateId, id: mandate.id }, 201);
});
