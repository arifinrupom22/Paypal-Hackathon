import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../../src/lib/policy/engine";
import { createPolicyFixture } from "./fixtures";

describe("PACT policy engine", () => {
  it("authorizes an in-scope proposal and reports every check", () => {
    const { input } = createPolicyFixture();
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("AUTHORIZED");
    expect(result.failedCheckIds).toEqual([]);
    expect(result.checks.length).toBeGreaterThanOrEqual(16);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("rejects a mandate whose signed columns were tampered with", () => {
    const { input, mandate } = createPolicyFixture();
    mandate.maxTotal = "50000.00";
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("mandate_signature");
  });

  it("rejects an expired mandate with EXPIRED", () => {
    const { input } = createPolicyFixture({ expiresAt: new Date(Date.now() - 60_000) });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("EXPIRED");
    expect(result.failedCheckIds).toContain("mandate_not_expired");
  });

  it("rejects a revoked mandate with REVOKED", () => {
    const { input } = createPolicyFixture({ status: "REVOKED", revokedAt: new Date() });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("REVOKED");
    expect(result.failedCheckIds).toContain("mandate_not_revoked");
  });

  it("blocks an unauthorized merchant", () => {
    const { input } = createPolicyFixture({
      merchantName: "Northwind Traders",
      merchantDomain: "northwind.example",
    });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("merchant_allowlist");
  });

  it("blocks an unauthorized category", () => {
    const { input } = createPolicyFixture({ category: "Luxury Travel" });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("category_allowlist");
  });

  it("blocks amounts over the per-transaction ceiling", () => {
    const { input } = createPolicyFixture({ amount: "400.00", maxPerTransaction: "150.00" });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("per_transaction_limit");
  });

  it("blocks amounts that exceed the remaining budget", () => {
    const { input } = createPolicyFixture({ amount: "40.00", spentTotal: "480.00", maxTotal: "500.00" });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("budget_available");
  });

  it("blocks once the transaction count is exhausted", () => {
    const { input } = createPolicyFixture({
      maxTransactions: 3,
      activeTransactionCount: 3,
      amount: "10.00",
    });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("transaction_count");
  });

  it("blocks replayed execution identifiers", () => {
    const { input } = createPolicyFixture({ executionReused: true });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("execution_uniqueness");
  });

  it("rejects a tampered proposal signature", () => {
    const { input } = createPolicyFixture();
    input.proposal.amount = "10.00";
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("proposal_signature");
  });

  it("requires owner step-up approval above the configured threshold", () => {
    const { input, proposal } = createPolicyFixture({
      amount: "120.00",
      approvalThreshold: "50.00",
    });
    const withoutApproval = evaluatePolicy(input);
    expect(withoutApproval.outcome).toBe("REQUIRES_USER_APPROVAL");
    expect(withoutApproval.failedCheckIds).toContain("approval_requirement");

    const withApproval = evaluatePolicy({
      ...input,
      approval: {
        approvalId: "apv_fixture_0001",
        proposalId: proposal.id,
        status: "APPROVED",
        expiresAt: new Date(Date.now() + 600_000),
        approved: true,
      },
    });
    expect(withApproval.outcome).toBe("AUTHORIZED");
  });

  it("does not let a forged approval unlock a proposal", () => {
    const { input } = createPolicyFixture({
      amount: "120.00",
      approvalThreshold: "50.00",
      approval: {
        approvalId: "apv_forged",
        proposalId: "clxfixtureproposal0001",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 600_000),
        approved: false,
      },
    });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("REQUIRES_USER_APPROVAL");
    expect(result.failedCheckIds).toContain("approval_requirement");
  });

  it("blocks a child mandate whose ceiling exceeds the parent's remaining authority", () => {
    const { input } = createPolicyFixture({
      maxTotal: "200.00",
      delegation: {
        parentMaxTotal: "100.00",
        parentSpent: "90.00",
        parentExpiresAt: new Date(Date.now() + 7_200_000),
      },
    });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("delegation_budget");
  });

  it("blocks child scopes that exceed the parent scope", () => {
    const { input } = createPolicyFixture({
      delegation: {
        parentMaxTotal: "1000.00",
        parentSpent: "0.00",
        parentExpiresAt: new Date(Date.now() + 7_200_000),
        parentScopes: [
          { type: "MERCHANT", normalizedValue: "lambda labs, inc." },
          { type: "CATEGORY", normalizedValue: "office hardware" },
        ],
      },
    });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("delegation_scope");
  });

  it("blocks a child expiry beyond the parent expiry", () => {
    const { input } = createPolicyFixture({
      delegation: {
        parentMaxTotal: "1000.00",
        parentSpent: "0.00",
        parentExpiresAt: new Date(Date.now() + 600_000),
      },
    });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("delegation_expiry");
  });

  it("propagates parent revocation to a delegated mandate", () => {
    const { input } = createPolicyFixture({
      delegation: {
        parentMaxTotal: "1000.00",
        parentSpent: "0.00",
        parentExpiresAt: new Date(Date.now() + 7_200_000),
        parentStatus: "REVOKED",
        parentRevokedAt: new Date(),
      },
    });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("REVOKED");
    expect(result.failedCheckIds).toContain("delegation_parent");
  });

  it("rejects a delegated mandate when a revoked ancestor is not the immediate parent", () => {
    const { input } = createPolicyFixture({
      delegation: {
        parentMaxTotal: "1000.00",
        parentSpent: "0.00",
        parentExpiresAt: new Date(Date.now() + 7_200_000),
      },
    });
    input.ancestors.push({
      ...input.ancestors[0],
      id: "clxfixturegrandparent0001",
      mandateId: "mnd_fixture_grandparent",
      status: "REVOKED",
      revokedAt: new Date(),
    });

    const result = evaluatePolicy(input);
    expect(result.outcome).toBe("REVOKED");
    expect(result.failedCheckIds).toContain("delegation_ancestor_chain");
  });

  it("blocks a child whose ceiling collides with already committed sibling capacity", () => {
    const { input } = createPolicyFixture({
      delegation: {
        parentMaxTotal: "100.00",
        parentSpent: "0.00",
        parentExpiresAt: new Date(Date.now() + 7_200_000),
        parentCommittedTotal: "60.00",
      },
      maxTotal: "50.00",
    });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("delegation_budget");
  });

  it("blocks delegated per-transaction and approval-threshold escalation", () => {
    const { input } = createPolicyFixture({
      delegation: {
        parentMaxTotal: "1000.00",
        parentSpent: "0.00",
        parentExpiresAt: new Date(Date.now() + 7_200_000),
        parentMaxPerTransaction: "40.00",
        parentApprovalThreshold: "20.00",
      },
    });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("delegation_per_transaction");
    expect(result.failedCheckIds).toContain("delegation_approval");
  });

  it("rejects a descendant agent when an ancestor agent is suspended", () => {
    const { input } = createPolicyFixture({ lineageActive: false });
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("agent_identity");
  });

  it("rejects proposals owned by a different principal", () => {
    const { input } = createPolicyFixture();
    input.expectedOwnerId = "usr_attacker";
    const result = evaluatePolicy(input);

    expect(result.outcome).toBe("BLOCKED");
    expect(result.failedCheckIds).toContain("mandate_ownership");
  });
});
