import "server-only";
import { db } from "../db";

/** Loads a decision, its signed proposal and linked audit evidence for explainability. */
export async function getDecisionDetail(ownerId: string, idOrDecisionId: string) {
  const decision = await db.policyDecision.findFirst({
    where: {
      ownerId,
      OR: [{ id: idOrDecisionId }, { decisionId: idOrDecisionId }],
    },
    include: {
      proposal: { include: { agent: true } },
      mandate: { include: { scopes: true, agent: true } },
      transaction: true,
    },
  });
  if (!decision) return null;

  const auditEvents = await db.auditEvent.findMany({
    where: {
      ownerId,
      OR: [{ resourceId: decision.decisionId }, { resourceId: decision.proposal.proposalId }],
    },
    orderBy: { createdAt: "asc" },
  });

  return { decision, auditEvents };
}
