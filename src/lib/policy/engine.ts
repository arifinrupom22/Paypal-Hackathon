import Decimal from "decimal.js";
import { canonicalize, sha256Hex } from "../crypto/canonical";
import { verifySignature } from "../crypto/keys";
import { buildMandatePayload, buildProposalPayload, type MandateScopeLike } from "../crypto/mandate-payload";
import { formatMoney, money, normalizeCategory, normalizeDomain, normalizeMerchant } from "../money";

export type PolicyOutcome =
  | "AUTHORIZED"
  | "BLOCKED"
  | "REQUIRES_USER_APPROVAL"
  | "EXPIRED"
  | "REVOKED";

export interface PolicyCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface MandateSnapshot {
  id: string;
  mandateId: string;
  ownerId: string;
  agentId: string;
  rootAgentId: string;
  parentMandateId: string | null;
  title: string;
  currency: string;
  maxTotal: string;
  maxPerTransaction: string;
  approvalThreshold: string | null;
  maxTransactions: number;
  expiresAt: Date;
  delegationAllowed: boolean;
  status: string;
  signature: string;
  signingKeyId: string;
  canonicalHash: string;
  nonce: string;
  issuedAt: Date;
  revokedAt: Date | null;
  scopes: MandateScopeLike[];
  spentTotal: string;
  activeTransactionCount: number;
  /** Direct spend plus active child-mandate ceilings, when delegated children exist. */
  committedTotal?: string;
  committedTransactions?: number;
}

export interface AncestorMandateSnapshot {
  id: string;
  mandateId: string;
  agentId: string;
  currency: string;
  maxTotal: string;
  spentTotal: string;
  maxPerTransaction?: string;
  approvalThreshold?: string | null;
  /** Parent direct spend plus active child ceilings, excluding the mandate being evaluated. */
  committedTotal?: string;
  committedTransactions?: number;
  maxTransactions: number;
  expiresAt: Date;
  delegationAllowed: boolean;
  status: string;
  revokedAt: Date | null;
  scopes: MandateScopeLike[];
}

export interface AgentSnapshot {
  id: string;
  ownerId: string;
  status: string;
  tier: string;
  parentAgentId: string | null;
  publicKey: string;
  lineage: string[];
  /** False when any parent agent in the lineage is suspended or revoked. */
  lineageActive?: boolean;
}

export interface ProposalSnapshot {
  id: string;
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
  signature: string;
  canonicalHash: string;
  createdAt: Date;
}

export interface ApprovalSnapshot {
  approvalId: string;
  proposalId: string;
  status: string;
  expiresAt: Date;
  approved: boolean;
}

export interface PolicyEvaluationInput {
  now: Date;
  expectedOwnerId: string;
  platformKeyId: string;
  platformPublicKeyBase64: string;
  mandate: MandateSnapshot | null;
  ancestors: AncestorMandateSnapshot[];
  agent: AgentSnapshot | null;
  proposal: ProposalSnapshot;
  executionId: string;
  idempotencyKey: string;
  executionReused: boolean;
  idempotencyReused: boolean;
  approval: ApprovalSnapshot | null;
}

export interface PolicyEvaluationResult {
  outcome: PolicyOutcome;
  checks: PolicyCheck[];
  failedCheckIds: string[];
  explanation: string;
  evaluatedAt: Date;
}

const ACTIVE_STATUSES = new Set(["ACTIVE"]);

function check(id: string, label: string, passed: boolean, detail: string): PolicyCheck {
  return { id, label, passed, detail };
}

function subsetOf(child: MandateScopeLike[], parent: MandateScopeLike[]): string[] {
  const allowed = new Set(parent.map((scope) => `${scope.type}:${scope.normalizedValue}`));
  return child
    .filter((scope) => !allowed.has(`${scope.type}:${scope.normalizedValue}`))
    .map((scope) => scope.normalizedValue);
}

function scopeSetAllows(scopes: MandateScopeLike[], type: "MERCHANT" | "CATEGORY", candidate: string): boolean {
  const values = scopes.filter((scope) => scope.type === type).map((scope) => scope.normalizedValue);
  return values.includes(candidate);
}

/**
 * PACT's authoritative, deterministic authorization engine. It receives a
 * snapshot read from PostgreSQL and returns a decision. It never trusts client
 * state, AI output, or previously stored decision flags.
 */
export function evaluatePolicy(input: PolicyEvaluationInput): PolicyEvaluationResult {
  const checks: PolicyCheck[] = [];
  const now = input.now;
  const { mandate, proposal, agent } = input;

  checks.push(
    check(
      "mandate_present",
      "Mandate exists",
      Boolean(mandate),
      mandate ? `Resolved ${mandate.mandateId}.` : "No mandate matches the proposal reference.",
    ),
  );

  if (!mandate) {
    return finalize(checks, "BLOCKED", now, "The referenced mandate could not be resolved.");
  }

  checks.push(
    check(
      "mandate_ownership",
      "Owner binding",
      mandate.ownerId === input.expectedOwnerId,
      mandate.ownerId === input.expectedOwnerId
        ? "Mandate belongs to the authenticated owner."
        : "Mandate owner does not match the authenticated principal.",
    ),
  );

  const rebuiltPayload = buildMandatePayload({
    mandateId: mandate.mandateId,
    ownerId: mandate.ownerId,
    agentId: mandate.agentId,
    rootAgentId: mandate.rootAgentId,
    parentMandateId: mandate.parentMandateId,
    currency: mandate.currency,
    maxTotal: mandate.maxTotal,
    maxPerTransaction: mandate.maxPerTransaction,
    approvalThreshold: mandate.approvalThreshold,
    maxTransactions: mandate.maxTransactions,
    expiresAt: mandate.expiresAt,
    delegationAllowed: mandate.delegationAllowed,
    scopes: mandate.scopes,
    nonce: mandate.nonce,
    issuedAt: mandate.issuedAt,
  });
  const rebuiltHash = sha256Hex(canonicalize(rebuiltPayload));
  const hashMatches = rebuiltHash === mandate.canonicalHash;
  const signatureValid =
    hashMatches &&
    mandate.signingKeyId === input.platformKeyId &&
    verifySignature(rebuiltPayload, mandate.signature, input.platformPublicKeyBase64);

  checks.push(
    check(
      "mandate_signature",
      "Ed25519 mandate signature",
      signatureValid,
      signatureValid
        ? `Signature verified against ${mandate.signingKeyId}.`
        : hashMatches
          ? "Signature verification failed for the signed mandate payload."
          : "Canonical payload hash mismatch: signed mandate columns were modified.",
    ),
  );

  const revoked = mandate.status === "REVOKED" || mandate.revokedAt !== null;
  checks.push(
    check(
      "mandate_not_revoked",
      "Revocation state",
      !revoked,
      revoked ? "Mandate has been revoked and cannot authorize spending." : "Mandate is not revoked.",
    ),
  );

  const expired = mandate.expiresAt.getTime() <= now.getTime();
  checks.push(
    check(
      "mandate_not_expired",
      "Expiration",
      !expired,
      expired
        ? `Mandate expired at ${mandate.expiresAt.toISOString()}.`
        : `Valid until ${mandate.expiresAt.toISOString()}.`,
    ),
  );

  checks.push(
    check(
      "mandate_status",
      "Mandate status",
      ACTIVE_STATUSES.has(mandate.status),
      ACTIVE_STATUSES.has(mandate.status)
        ? "Mandate status is ACTIVE."
        : `Mandate status is ${mandate.status}.`,
    ),
  );

  const agentOwned = Boolean(agent) && agent!.ownerId === input.expectedOwnerId;
  const agentLineageActive = agent?.lineageActive !== false;
  const agentActive = Boolean(agent) && agent!.status === "ACTIVE" && agentLineageActive;
  const agentBound = Boolean(agent) && mandate.agentId === agent!.id;
  checks.push(
    check(
      "agent_identity",
      "Agent identity",
      agentOwned && agentActive && agentBound,
      !agent
        ? "No registered agent matches the mandate subject."
        : !agentBound
          ? "Mandate subject agent does not match the requesting agent."
          : !agentOwned
            ? "Agent does not belong to the authenticated owner."
            : !agentLineageActive
              ? "An ancestor agent is suspended or revoked; the descendant cannot act."
              : !agentActive
                ? `Agent status is ${agent.status}.`
              : `Agent ${agent.id} is active and bound to the mandate.`,
    ),
  );

  const proposalPayload = buildProposalPayload({
    proposalId: proposal.proposalId,
    agentId: proposal.agentId,
    mandateId: proposal.mandateId,
    merchantName: proposal.merchantName,
    merchantId: proposal.merchantId,
    merchantDomain: proposal.merchantDomain,
    category: proposal.category,
    amount: proposal.amount,
    currency: proposal.currency,
    description: proposal.description,
    lineItems: proposal.lineItems,
    createdAt: proposal.createdAt,
  });
  const proposalHash = sha256Hex(canonicalize(proposalPayload));
  const proposalSignatureValid =
    proposal.agentId === mandate.agentId &&
    Boolean(agent) &&
    proposalHash === proposal.canonicalHash &&
    verifySignature(proposalPayload, proposal.signature, agent!.publicKey);

  checks.push(
    check(
      "proposal_signature",
      "Agent proposal signature",
      proposalSignatureValid,
      proposalSignatureValid
        ? "Proposal signed by the mandate's bound agent identity."
        : "Proposal signature is invalid, or the proposal payload was modified after signing.",
    ),
  );

  const amount = money(proposal.amount);
  const positiveAmount = amount.greaterThan(0);
  const preciseAmount = amount.decimalPlaces() <= 2;
  checks.push(
    check(
      "amount_valid",
      "Amount validity",
      positiveAmount && preciseAmount,
      positiveAmount && preciseAmount
        ? `Amount ${formatMoney(amount)} is a positive two-decimal value.`
        : "Amount must be greater than zero with at most two decimal places.",
    ),
  );

  checks.push(
    check(
      "currency_match",
      "Currency match",
      proposal.currency.toUpperCase() === mandate.currency.toUpperCase(),
      proposal.currency.toUpperCase() === mandate.currency.toUpperCase()
        ? `Proposal currency matches mandate currency ${mandate.currency}.`
        : `Proposal currency ${proposal.currency} does not match mandate currency ${mandate.currency}.`,
    ),
  );

  const merchantCandidates = [
    normalizeMerchant(proposal.merchantName),
    proposal.merchantId ? normalizeMerchant(proposal.merchantId) : null,
    proposal.merchantDomain ? normalizeDomain(proposal.merchantDomain) : null,
  ].filter((value): value is string => Boolean(value));

  const merchantScopes = mandate.scopes
    .filter((scope) => scope.type === "MERCHANT")
    .map((scope) => scope.normalizedValue);
  const merchantAllowed = merchantCandidates.some((candidate) =>
    merchantScopes.some(
      (scope) => scope === candidate || normalizeDomain(scope) === normalizeDomain(candidate),
    ),
  );
  checks.push(
    check(
      "merchant_allowlist",
      "Merchant allowlist",
      merchantAllowed,
      merchantAllowed
        ? `Merchant resolves to an allowlisted counterparty (${merchantScopes.join(", ")}).`
        : `Merchant "${proposal.merchantName}" is outside the mandate's merchant allowlist.`,
    ),
  );

  const categoryAllowed = scopeSetAllows(
    mandate.scopes,
    "CATEGORY",
    normalizeCategory(proposal.category),
  );
  checks.push(
    check(
      "category_allowlist",
      "Category authorization",
      categoryAllowed,
      categoryAllowed
        ? `Category "${proposal.category}" is permitted.`
        : `Category "${proposal.category}" is not in the mandate's allowed categories.`,
    ),
  );

  const perTransactionLimit = money(mandate.maxPerTransaction);
  const withinPerTx = amount.lessThanOrEqualTo(perTransactionLimit);
  checks.push(
    check(
      "per_transaction_limit",
      "Per-transaction ceiling",
      withinPerTx,
      withinPerTx
        ? `Amount ${formatMoney(amount)} is within the ${formatMoney(perTransactionLimit)} per-transaction ceiling.`
        : `Amount ${formatMoney(amount)} exceeds the ${formatMoney(perTransactionLimit)} per-transaction ceiling.`,
    ),
  );

  const spent = money(mandate.committedTotal ?? mandate.spentTotal);
  const maxTotal = money(mandate.maxTotal);
  const remaining = Decimal.max(maxTotal.minus(spent), 0);
  const withinBudget = amount.lessThanOrEqualTo(remaining);
  checks.push(
    check(
      "budget_available",
      "Remaining budget",
      withinBudget,
      withinBudget
        ? `${formatMoney(amount)} fits within the remaining ${formatMoney(remaining)} of ${formatMoney(maxTotal)}.`
        : `${formatMoney(amount)} exceeds the remaining mandate budget of ${formatMoney(remaining)}.`,
    ),
  );

  const activeCount = mandate.committedTransactions ?? mandate.activeTransactionCount;
  const countAvailable = activeCount + 1 <= mandate.maxTransactions;
  checks.push(
    check(
      "transaction_count",
      "Transaction count limit",
      countAvailable,
      countAvailable
        ? `Transaction ${activeCount + 1} of ${mandate.maxTransactions}.`
        : `Mandate has consumed all ${mandate.maxTransactions} authorized transactions.`,
    ),
  );

  const executionUnique = !input.executionReused && !input.idempotencyReused;
  checks.push(
    check(
      "execution_uniqueness",
      "Replay protection",
      executionUnique,
      executionUnique
        ? "Execution identifier and idempotency key are unused."
        : "Execution identifier or idempotency key has already been used.",
    ),
  );

  const delegationFailed: PolicyCheck[] = [];
  if (mandate.parentMandateId) {
    const parent = input.ancestors[0];
    const revokedAncestor = input.ancestors.find(
      (ancestor) => ancestor.status === "REVOKED" || ancestor.revokedAt !== null,
    );
    const expiredAncestor = input.ancestors.find(
      (ancestor) => ancestor.expiresAt.getTime() <= now.getTime(),
    );
    delegationFailed.push(
      check(
        "delegation_ancestor_chain",
        "Ancestor chain",
        !revokedAncestor && !expiredAncestor,
        revokedAncestor
          ? `Ancestor mandate ${revokedAncestor.mandateId} has been revoked.`
          : expiredAncestor
            ? `Ancestor mandate ${expiredAncestor.mandateId} has expired.`
            : "Every ancestor mandate is active and unexpired.",
      ),
    );
    if (!parent) {
      delegationFailed.push(
        check("delegation_parent", "Parent mandate", false, "Parent mandate could not be resolved."),
      );
    } else {
      const parentRevoked = parent.status === "REVOKED" || parent.revokedAt !== null;
      const parentExpired = parent.expiresAt.getTime() <= now.getTime();
      const chainOk =
        !parentRevoked && !parentExpired && parent.delegationAllowed && parent.status === "ACTIVE";
      delegationFailed.push(
        check(
          "delegation_parent",
          "Parent mandate chain",
          chainOk,
          parentRevoked
            ? `Parent mandate ${parent.mandateId} has been revoked; all descendants are invalid.`
            : parentExpired
              ? `Parent mandate ${parent.mandateId} has expired.`
              : !parent.delegationAllowed
                ? `Parent mandate ${parent.mandateId} does not permit delegation.`
                : `Parent mandate ${parent.mandateId} is active.`,
        ),
      );

      const parentCommitted = money(parent.committedTotal ?? parent.spentTotal);
      const parentRemaining = Decimal.max(money(parent.maxTotal).minus(parentCommitted), 0);
      const budgetContained = maxTotal.lessThanOrEqualTo(parentRemaining);
      delegationFailed.push(
        check(
          "delegation_budget",
          "Delegated budget containment",
          budgetContained,
          budgetContained
            ? `Child ceiling ${formatMoney(maxTotal)} fits inside parent remaining ${formatMoney(parentRemaining)}.`
            : `Child ceiling ${formatMoney(maxTotal)} exceeds parent remaining authority ${formatMoney(parentRemaining)}.`,
        ),
      );

      const perTransactionContained =
        !parent.maxPerTransaction ||
        money(mandate.maxPerTransaction).lessThanOrEqualTo(money(parent.maxPerTransaction));
      delegationFailed.push(
        check(
          "delegation_per_transaction",
          "Delegated per-transaction ceiling",
          perTransactionContained,
          perTransactionContained
            ? "Child per-transaction ceiling is within the parent's ceiling."
            : `Child per-transaction ceiling ${formatMoney(mandate.maxPerTransaction)} exceeds the parent's ${formatMoney(parent.maxPerTransaction!)}.`,
        ),
      );

      const committedTransactions = parent.committedTransactions ?? 0;
      const transactionCountContained =
        !parent.maxTransactions ||
        mandate.maxTransactions + committedTransactions <= parent.maxTransactions;
      delegationFailed.push(
        check(
          "delegation_transaction_count",
          "Delegated transaction count",
          transactionCountContained,
          transactionCountContained
            ? "Child transaction ceiling is within the parent's remaining transaction count."
            : `Child transaction ceiling ${mandate.maxTransactions} exceeds the parent's remaining count (${Math.max(0, parent.maxTransactions - committedTransactions)}).`,
        ),
      );

      const parentThreshold =
        parent.approvalThreshold === undefined || parent.approvalThreshold === null
          ? null
          : money(parent.approvalThreshold);
      const childThreshold = mandate.approvalThreshold === null ? null : money(mandate.approvalThreshold);
      const approvalContained =
        parentThreshold === null ||
        (childThreshold !== null && childThreshold.lessThanOrEqualTo(parentThreshold));
      delegationFailed.push(
        check(
          "delegation_approval",
          "Delegated approval threshold",
          approvalContained,
          approvalContained
            ? "Child step-up threshold preserves the parent's approval requirement."
            : "Child mandate would bypass the parent's step-up approval threshold.",
        ),
      );

      const expiryContained = mandate.expiresAt.getTime() <= parent.expiresAt.getTime();
      delegationFailed.push(
        check(
          "delegation_expiry",
          "Delegated expiry containment",
          expiryContained,
          expiryContained
            ? "Child expiry is within the parent's validity window."
            : "Child expiry exceeds the parent mandate's expiry.",
        ),
      );

      const outOfScope = subsetOf(mandate.scopes, parent.scopes);
      delegationFailed.push(
        check(
          "delegation_scope",
          "Delegated scope containment",
          outOfScope.length === 0,
          outOfScope.length === 0
            ? "Child permissions are a subset of the parent mandate."
            : `Child scopes exceed parent authority: ${outOfScope.join(", ")}.`,
        ),
      );

      const lineageOk =
        Boolean(agent) && agent!.lineage.includes(parent.agentId) && parent.currency === mandate.currency;
      delegationFailed.push(
        check(
          "delegation_agent_lineage",
          "Agent lineage",
          lineageOk,
          lineageOk
            ? "Child agent descends from the delegating parent agent."
            : "Child agent does not descend from the parent mandate's agent, or currency differs.",
        ),
      );
    }
    checks.push(...delegationFailed);
  }

  const threshold = mandate.approvalThreshold ? money(mandate.approvalThreshold) : null;
  const approvalRequired = threshold !== null && amount.greaterThan(threshold);
  let approvalSatisfied = true;
  if (approvalRequired) {
    const approval = input.approval;
    approvalSatisfied = Boolean(
      approval &&
        approval.proposalId === proposal.id &&
        approval.status === "APPROVED" &&
        approval.approved &&
        approval.expiresAt.getTime() > now.getTime(),
    );
  }
  checks.push(
    check(
      "approval_requirement",
      "Step-up approval",
      approvalSatisfied,
      !approvalRequired
        ? "Amount is below the mandate's step-up approval threshold."
        : approvalSatisfied
          ? "Owner approved this exact proposal and the approval is unexpired."
          : "Amount exceeds the step-up threshold and requires explicit owner approval.",
    ),
  );

  const failedCheckIds = checks.filter((entry) => !entry.passed).map((entry) => entry.id);
  const hardFailures = failedCheckIds.filter((id) => id !== "approval_requirement");

  let outcome: PolicyOutcome = "AUTHORIZED";
  if (revoked || input.ancestors.some((ancestor) => ancestor.status === "REVOKED" || ancestor.revokedAt)) {
    outcome = "REVOKED";
  } else if (expired || input.ancestors.some((ancestor) => ancestor.expiresAt.getTime() <= now.getTime())) {
    outcome = "EXPIRED";
  } else if (hardFailures.length > 0) {
    outcome = "BLOCKED";
  } else if (!approvalSatisfied) {
    outcome = "REQUIRES_USER_APPROVAL";
  }

  return finalize(
    checks,
    outcome,
    now,
    outcome === "AUTHORIZED"
      ? `All ${checks.length} policy checks passed. ${formatMoney(amount)} authorized under ${mandate.mandateId}.`
      : `Authorization denied: ${checks
          .filter((entry) => !entry.passed)
          .map((entry) => entry.label)
          .join(", ")}.`,
  );
}

function finalize(
  checks: PolicyCheck[],
  outcome: PolicyOutcome,
  evaluatedAt: Date,
  explanation: string,
): PolicyEvaluationResult {
  return {
    outcome,
    checks,
    failedCheckIds: checks.filter((entry) => !entry.passed).map((entry) => entry.id),
    explanation,
    evaluatedAt,
  };
}
