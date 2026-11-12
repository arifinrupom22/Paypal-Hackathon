import "server-only";
import { db } from "../db";

/**
 * Loads one transaction together with the proposal, decision checks, mandate,
 * agent and audit records needed to reconstruct its authorization trace.
 * Every field is read from PostgreSQL; nothing is inferred by the UI.
 */
export async function getTransactionDetail(ownerId: string, idOrTransactionId: string) {
  const transaction = await db.transaction.findFirst({
    where: {
      ownerId,
      OR: [{ id: idOrTransactionId }, { transactionId: idOrTransactionId }],
    },
    include: {
      proposal: true,
      mandate: {
        include: {
          scopes: true,
          agent: true,
          parentMandate: { include: { scopes: true } },
        },
      },
      policyDecision: true,
    },
  });

  if (!transaction) return null;

  const auditEvents = await db.auditEvent.findMany({
    where: {
      ownerId,
      OR: [
        { eventId: { in: transaction.auditRefs } },
        { resourceId: transaction.transactionId },
        { resourceId: transaction.policyDecision.decisionId },
        { resourceId: transaction.proposal.proposalId },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  return { transaction, auditEvents };
}
