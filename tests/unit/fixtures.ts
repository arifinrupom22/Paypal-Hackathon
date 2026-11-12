import { createAgentKeyPair, signAsAgent } from "../../src/lib/crypto/agent-keys";
import { platformKeys, signPayload } from "../../src/lib/crypto/keys";
import { buildMandatePayload, buildProposalPayload } from "../../src/lib/crypto/mandate-payload";
import type {
  AgentSnapshot,
  AncestorMandateSnapshot,
  ApprovalSnapshot,
  MandateSnapshot,
  PolicyEvaluationInput,
  ProposalSnapshot,
} from "../../src/lib/policy/engine";

export interface FixtureOptions {
  amount?: string;
  maxTotal?: string;
  maxPerTransaction?: string;
  approvalThreshold?: string | null;
  maxTransactions?: number;
  expiresAt?: Date;
  status?: string;
  revokedAt?: Date | null;
  spentTotal?: string;
  activeTransactionCount?: number;
  merchantName?: string;
  merchantDomain?: string | null;
  category?: string;
  currency?: string;
  executionReused?: boolean;
  idempotencyReused?: boolean;
  lineageActive?: boolean;
  approval?: ApprovalSnapshot | null;
  delegation?: {
    parentMaxTotal: string;
    parentSpent: string;
    parentExpiresAt: Date;
    parentStatus?: string;
    parentRevokedAt?: Date | null;
    parentDelegationAllowed?: boolean;
    parentMaxPerTransaction?: string;
    parentApprovalThreshold?: string | null;
    parentCommittedTotal?: string;
    parentCommittedTransactions?: number;
    parentMaxTransactions?: number;
    parentScopes?: { type: "MERCHANT" | "CATEGORY"; normalizedValue: string }[];
    childAgentLineage?: string[];
    parentAgentId?: string;
    parentCurrency?: string;
  };
}

export interface PolicyFixture {
  input: PolicyEvaluationInput;
  mandate: MandateSnapshot;
  proposal: ProposalSnapshot;
  agentKey: ReturnType<typeof createAgentKeyPair>;
  signMandate: (overrides: Partial<MandateSnapshot>) => void;
}

const OWNER_ID = "usr_fixture_owner";
const AGENT_ID = "agt_fixture_agent";
const ROOT_AGENT_ID = "agt_fixture_agent";

export function createPolicyFixture(options: FixtureOptions = {}): PolicyFixture {
  const agentKey = createAgentKeyPair();
  const keys = platformKeys();
  const now = new Date();
  const mandateId = "mnd_fixture_0001";
  const issuedAt = new Date(now.getTime() - 60_000);
  const expiresAt = options.expiresAt ?? new Date(now.getTime() + 3_600_000);
  const scopes = [
    { type: "MERCHANT" as const, normalizedValue: "lambda labs, inc." },
    { type: "CATEGORY" as const, normalizedValue: "cloud compute" },
  ];

  const mandate: MandateSnapshot = {
    id: "clxfixturemandate0001",
    mandateId,
    ownerId: OWNER_ID,
    agentId: AGENT_ID,
    rootAgentId: ROOT_AGENT_ID,
    parentMandateId: null,
    title: "Fixture mandate",
    currency: options.currency ?? "USD",
    maxTotal: options.maxTotal ?? "500.00",
    maxPerTransaction: options.maxPerTransaction ?? "150.00",
    approvalThreshold: options.approvalThreshold ?? null,
    maxTransactions: options.maxTransactions ?? 5,
    expiresAt,
    delegationAllowed: false,
    status: options.status ?? "ACTIVE",
    signature: "",
    signingKeyId: keys.keyId,
    canonicalHash: "",
    nonce: "0f".repeat(16),
    issuedAt,
    revokedAt: options.revokedAt ?? null,
    scopes,
    spentTotal: options.spentTotal ?? "0.00",
    activeTransactionCount: options.activeTransactionCount ?? 0,
  };

  const payloadInput = {
    mandateId,
    ownerId: OWNER_ID,
    agentId: AGENT_ID,
    rootAgentId: ROOT_AGENT_ID,
    parentMandateId: null as string | null,
    currency: mandate.currency,
    maxTotal: mandate.maxTotal,
    maxPerTransaction: mandate.maxPerTransaction,
    approvalThreshold: mandate.approvalThreshold,
    maxTransactions: mandate.maxTransactions,
    expiresAt,
    delegationAllowed: false,
    scopes,
    nonce: mandate.nonce,
    issuedAt,
  };

  const signed = signPayload(buildMandatePayload(payloadInput));
  mandate.signature = signed.signature;
  mandate.canonicalHash = signed.canonicalHash;

  const proposalCreatedAt = new Date(now.getTime() - 30_000);
  const proposalPayload = buildProposalPayload({
    proposalId: "prop_fixture_0001",
    agentId: AGENT_ID,
    mandateId: mandate.id,
    merchantName: options.merchantName ?? "Lambda Labs, Inc.",
    merchantId: "MERCH_LL_9921",
    merchantDomain: options.merchantDomain ?? "lambdalabs.com",
    category: options.category ?? "Cloud Compute",
    amount: options.amount ?? "100.00",
    currency: mandate.currency,
    description: "Fixture GPU purchase",
    lineItems: [{ sku: "LL-GPU-H100-1HR", quantity: 1 }],
    createdAt: proposalCreatedAt,
  });
  const proposalSignature = signAsAgent(agentKey.encryptedPrivateKey, proposalPayload);

  const proposal: ProposalSnapshot = {
    id: "clxfixtureproposal0001",
    proposalId: "prop_fixture_0001",
    agentId: AGENT_ID,
    mandateId: mandate.id,
    merchantName: options.merchantName ?? "Lambda Labs, Inc.",
    merchantId: "MERCH_LL_9921",
    merchantDomain: options.merchantDomain ?? "lambdalabs.com",
    category: options.category ?? "Cloud Compute",
    amount: options.amount ?? "100.00",
    currency: mandate.currency,
    description: "Fixture GPU purchase",
    lineItems: [{ sku: "LL-GPU-H100-1HR", quantity: 1 }],
    signature: proposalSignature.signature,
    canonicalHash: proposalSignature.canonicalHash,
    createdAt: proposalCreatedAt,
  };

  const agent: AgentSnapshot = {
    id: AGENT_ID,
    ownerId: OWNER_ID,
    status: "ACTIVE",
    tier: "ROOT",
    parentAgentId: null,
    publicKey: agentKey.publicKeyBase64,
    lineage: [AGENT_ID],
    lineageActive: options.lineageActive ?? true,
  };

  const ancestors: AncestorMandateSnapshot[] = [];
  if (options.delegation) {
    const parentScopes = options.delegation.parentScopes ?? scopes;
    const parentAgentId = options.delegation.parentAgentId ?? "agt_fixture_parent";
    mandate.parentMandateId = "clxfixtureparent0001";
    mandate.delegationAllowed = true;
    mandate.agentId = "agt_fixture_child";
    proposal.agentId = "agt_fixture_child";
    agent.id = "agt_fixture_child";
    agent.parentAgentId = parentAgentId;
    agent.lineage = options.delegation.childAgentLineage ?? ["agt_fixture_child", parentAgentId];

    ancestors.push({
      id: "clxfixtureparent0001",
      mandateId: "mnd_fixture_parent",
      agentId: parentAgentId,
      currency: options.delegation.parentCurrency ?? "USD",
      maxTotal: options.delegation.parentMaxTotal,
      spentTotal: options.delegation.parentSpent,
      maxPerTransaction: options.delegation.parentMaxPerTransaction,
      approvalThreshold: options.delegation.parentApprovalThreshold,
      committedTotal: options.delegation.parentCommittedTotal,
      committedTransactions: options.delegation.parentCommittedTransactions,
      maxTransactions: options.delegation.parentMaxTransactions ?? 10,
      expiresAt: options.delegation.parentExpiresAt,
      delegationAllowed: options.delegation.parentDelegationAllowed ?? true,
      status: options.delegation.parentStatus ?? "ACTIVE",
      revokedAt: options.delegation.parentRevokedAt ?? null,
      scopes: parentScopes,
    });
  }

  const input: PolicyEvaluationInput = {
    now,
    expectedOwnerId: OWNER_ID,
    platformKeyId: keys.keyId,
    platformPublicKeyBase64: keys.publicKeyBase64,
    mandate,
    ancestors,
    agent,
    proposal,
    executionId: "exec_fixture_0001",
    idempotencyKey: "idem_fixture_0001",
    executionReused: options.executionReused ?? false,
    idempotencyReused: options.idempotencyReused ?? false,
    approval: options.approval ?? null,
  };

  return {
    input,
    mandate,
    proposal,
    agentKey,
    signMandate: (overrides) => {
      Object.assign(mandate, overrides);
      const resigned = signPayload(
        buildMandatePayload({
          ...payloadInput,
          ...{
            maxTotal: mandate.maxTotal,
            maxPerTransaction: mandate.maxPerTransaction,
            approvalThreshold: mandate.approvalThreshold,
            maxTransactions: mandate.maxTransactions,
            expiresAt: mandate.expiresAt,
            parentMandateId: mandate.parentMandateId,
            agentId: mandate.agentId,
            delegationAllowed: mandate.delegationAllowed,
            scopes: mandate.scopes,
          },
        }),
      );
      mandate.signature = resigned.signature;
      mandate.canonicalHash = resigned.canonicalHash;
      input.platformKeyId = resigned.keyId;
    },
  };
}
