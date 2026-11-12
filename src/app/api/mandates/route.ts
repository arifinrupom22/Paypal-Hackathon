import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { clientKey, enforceRateLimit, ok, withApi } from "@/lib/api/response";
import { mandateCreateSchema } from "@/lib/validation/schemas";
import { createMandate, listMandatesForOwner } from "@/lib/services/mandates";
import { formatMoney } from "@/lib/money";

export const runtime = "nodejs";

export const GET = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);
  const params = request.nextUrl.searchParams;
  const rows = await listMandatesForOwner(auth.userId, {
    status: params.get("status") ?? undefined,
    search: params.get("q") ?? undefined,
    agentId: params.get("agentId") ?? undefined,
    currency: params.get("currency") ?? undefined,
  });

  return ok({
    mandates: rows.map(({ mandate, spend }) => ({
      id: mandate.id,
      mandateId: mandate.mandateId,
      title: mandate.title,
      description: mandate.description,
      status: mandate.status,
      currency: mandate.currency,
      maxTotal: formatMoney(mandate.maxTotal),
      maxPerTransaction: formatMoney(mandate.maxPerTransaction),
      spent: spend.spent,
      transactionCount: spend.activeCount,
      maxTransactions: mandate.maxTransactions,
      expiresAt: mandate.expiresAt,
      delegationAllowed: mandate.delegationAllowed,
      parentMandateId: mandate.parentMandateId,
      agent: { id: mandate.agent.id, name: mandate.agent.name, tier: mandate.agent.tier },
      scopes: mandate.scopes.map((scope) => ({
        type: scope.type,
        value: scope.value,
        normalizedValue: scope.normalizedValue,
      })),
      signature: mandate.signature,
      canonicalHash: mandate.canonicalHash,
      signingKeyId: mandate.signingKeyId,
      createdAt: mandate.createdAt,
    })),
  });
});

export const POST = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);
  enforceRateLimit(clientKey(request, "mandate-create"), 20, 60_000);
  const payload = mandateCreateSchema.parse(await request.json());

  const { mandate } = await createMandate({
    ownerId: auth.userId,
    createdById: auth.userId,
    actorLabel: auth.user.name,
    agentId: payload.agentId,
    title: payload.title,
    description: payload.description || undefined,
    currency: payload.currency,
    maxTotal: payload.maxTotal,
    maxPerTransaction: payload.maxPerTransaction,
    approvalThreshold: payload.approvalThreshold || null,
    maxTransactions: payload.maxTransactions,
    expiresAt: new Date(payload.expiresAt),
    delegationAllowed: payload.delegationAllowed,
    merchants: payload.merchants,
    categories: payload.categories,
    parentMandateId: payload.parentMandateId || null,
  });

  return ok({ mandateId: mandate.mandateId, id: mandate.id, status: mandate.status }, 201);
});
