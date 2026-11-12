
import { requireApiAuth } from "@/lib/auth/guards";
import { ok, withApi } from "@/lib/api/response";
import { AppError } from "@/lib/errors";
import { getMandateDetail } from "@/lib/services/mandates";

export const runtime = "nodejs";

export const GET = withApi<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const auth = await requireApiAuth(request);
  const { id } = await params;
  const detail = await getMandateDetail(auth.userId, id);
  if (!detail) throw new AppError("MANDATE_NOT_FOUND", "Mandate not found.", 404);

  const { mandate } = detail;
  return ok({
    mandate: {
      id: mandate.id,
      mandateId: mandate.mandateId,
      title: mandate.title,
      status: mandate.status,
      currency: mandate.currency,
      maxTotal: String(mandate.maxTotal),
      maxPerTransaction: String(mandate.maxPerTransaction),
      approvalThreshold: mandate.approvalThreshold ? String(mandate.approvalThreshold) : null,
      maxTransactions: mandate.maxTransactions,
      expiresAt: mandate.expiresAt,
      delegationAllowed: mandate.delegationAllowed,
      signature: mandate.signature,
      canonicalHash: mandate.canonicalHash,
      signingKeyId: mandate.signingKeyId,
      issuedAt: mandate.issuedAt,
      revokedAt: mandate.revokedAt,
      revocationReason: mandate.revocationReason,
      scopes: mandate.scopes,
      agent: {
        id: mandate.agent.id,
        name: mandate.agent.name,
        description: mandate.agent.description,
        tier: mandate.agent.tier,
        status: mandate.agent.status,
        publicKey: mandate.agent.publicKey,
        keyFingerprint: mandate.agent.keyFingerprint,
        createdAt: mandate.agent.createdAt,
      },
      parentMandate: mandate.parentMandate
        ? { mandateId: mandate.parentMandate.mandateId, id: mandate.parentMandate.id }
        : null,
      childMandates: mandate.childMandates.map((child) => ({
        id: child.id,
        mandateId: child.mandateId,
        title: child.title,
        status: child.status,
        agentName: child.agent.name,
        expiresAt: child.expiresAt,
      })),
    },
    spend: detail.spend,
    proof: detail.proof,
    transactions: detail.transactions,
    decisions: detail.decisions,
    approvals: detail.approvals,
  });
});
