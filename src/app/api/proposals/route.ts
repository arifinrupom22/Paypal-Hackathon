import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { clientKey, enforceRateLimit, ok, withApi } from "@/lib/api/response";
import { agentProposalSchema, proposalSchema } from "@/lib/validation/schemas";
import { createAgentPurchaseProposal, createProposal, listProposals } from "@/lib/services/proposals";
import { AppError } from "@/lib/errors";
import { money } from "@/lib/money";

export const runtime = "nodejs";

export const GET = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);
  const proposals = await listProposals(auth.userId, 50);
  return ok({ proposals });
});

export const POST = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);
  enforceRateLimit(clientKey(request, "proposal-create"), 30, 60_000);
  const body = await request.json();

  if (typeof body?.instruction === "string") {
    const payload = agentProposalSchema.parse(body);
    const result = await createAgentPurchaseProposal({
      ownerId: auth.userId,
      actorId: auth.userId,
      actorLabel: auth.user.name,
      mandateId: payload.mandateId,
      instruction: payload.instruction,
      sku: payload.sku,
    });
    return ok(
      {
        proposal: {
          id: result.proposal.id,
          proposalId: result.proposal.proposalId,
          amount: money(result.proposal.amount).toFixed(2),
          currency: result.proposal.currency,
          merchant: result.proposal.merchantName,
          category: result.proposal.category,
          description: result.proposal.description,
          mandateId: result.proposal.mandateId,
          agentName: result.agent.name,
        },
        selection: result.selection,
      },
      201,
    );
  }

  const payload = proposalSchema.parse(body);
  if (!payload.mandateId) throw new AppError("MANDATE_REQUIRED", "Select a mandate.", 422);

  const { proposal, agent } = await createProposal({
    ownerId: auth.userId,
    actorId: auth.userId,
    actorLabel: auth.user.name,
    mandateId: payload.mandateId,
    agentId: payload.agentId,
    merchantName: payload.merchantName,
    merchantId: payload.merchantId ?? null,
    merchantDomain: payload.merchantDomain ?? null,
    category: payload.category,
    amount: payload.amount,
    currency: payload.currency,
    description: payload.description,
    lineItems: payload.lineItems,
    source: payload.source,
  });

  return ok(
    {
      proposal: {
        id: proposal.id,
        proposalId: proposal.proposalId,
        amount: money(proposal.amount).toFixed(2),
        currency: proposal.currency,
        agentName: agent.name,
      },
    },
    201,
  );
});
