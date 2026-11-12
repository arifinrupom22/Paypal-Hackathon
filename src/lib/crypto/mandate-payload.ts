import { formatMoney } from "../money";

export interface MandateScopeLike {
  type: "MERCHANT" | "CATEGORY";
  normalizedValue: string;
}

export interface MandatePayloadInput {
  mandateId: string;
  ownerId: string;
  agentId: string;
  rootAgentId: string;
  parentMandateId: string | null;
  currency: string;
  maxTotal: string;
  maxPerTransaction: string;
  approvalThreshold: string | null;
  maxTransactions: number;
  expiresAt: Date;
  delegationAllowed: boolean;
  scopes: MandateScopeLike[];
  nonce: string;
  issuedAt: Date;
}

/**
 * The canonical mandate payload is rebuilt from persisted columns at verification
 * time. If any signed column is mutated, the rebuilt payload differs and the
 * Ed25519 signature fails.
 */
export function buildMandatePayload(input: MandatePayloadInput): Record<string, unknown> {
  const merchants = input.scopes
    .filter((scope) => scope.type === "MERCHANT")
    .map((scope) => scope.normalizedValue)
    .sort();
  const categories = input.scopes
    .filter((scope) => scope.type === "CATEGORY")
    .map((scope) => scope.normalizedValue)
    .sort();

  return {
    "@context": "https://pact.network/v1/mandate",
    schema: "pact.mandate.v1",
    mandate_id: input.mandateId,
    owner_id: input.ownerId,
    agent_id: input.agentId,
    root_agent_id: input.rootAgentId,
    parent_mandate_id: input.parentMandateId,
    currency: input.currency.toUpperCase(),
    constraints: {
      allowed_categories: categories,
      allowed_merchants: merchants,
      approval_threshold: input.approvalThreshold === null ? null : formatMoney(input.approvalThreshold),
      delegation_allowed: input.delegationAllowed,
      expires_at: input.expiresAt.toISOString(),
      issued_at: input.issuedAt.toISOString(),
      max_per_transaction: formatMoney(input.maxPerTransaction),
      max_total: formatMoney(input.maxTotal),
      max_transactions: input.maxTransactions,
    },
    nonce: input.nonce,
  };
}

export interface ProposalPayloadInput {
  proposalId: string;
  agentId: string;
  mandateId: string;
  merchantName: string;
  merchantId: string | null;
  merchantDomain: string | null;
  category: string;
  amount: string;
  currency: string;
  description: string;
  lineItems: unknown;
  createdAt: Date;
}

export function buildProposalPayload(input: ProposalPayloadInput): Record<string, unknown> {
  return {
    "@context": "https://pact.network/v1/proposal",
    schema: "pact.proposal.v1",
    proposal_id: input.proposalId,
    agent_id: input.agentId,
    mandate_id: input.mandateId,
    merchant: {
      name: input.merchantName,
      id: input.merchantId,
      domain: input.merchantDomain,
    },
    category: input.category,
    amount: formatMoney(input.amount),
    currency: input.currency.toUpperCase(),
    description: input.description,
    line_items: input.lineItems,
    created_at: input.createdAt.toISOString(),
  };
}
