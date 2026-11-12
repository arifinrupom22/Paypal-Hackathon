-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AgentTier" AS ENUM ('ROOT', 'CHILD');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MandateStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('MERCHANT', 'CATEGORY');

-- CreateEnum
CREATE TYPE "ProposalSource" AS ENUM ('AGENT', 'MANUAL', 'SECURITY_TEST');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PROPOSED', 'AUTHORIZED', 'BLOCKED', 'APPROVAL_REQUIRED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PolicyOutcome" AS ENUM ('AUTHORIZED', 'BLOCKED', 'REQUIRES_USER_APPROVAL', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('POLICY_APPROVED', 'AWAITING_BUYER_APPROVAL', 'CAPTURING', 'SETTLED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('PROCESSED', 'DUPLICATE', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tier" "AgentTier" NOT NULL DEFAULT 'ROOT',
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "parentAgentId" TEXT,
    "publicKey" TEXT NOT NULL,
    "credentialCiphertext" TEXT NOT NULL,
    "keyFingerprint" TEXT NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mandate" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "rootAgentId" TEXT NOT NULL,
    "parentMandateId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "currency" VARCHAR(3) NOT NULL,
    "maxTotal" DECIMAL(18,2) NOT NULL,
    "maxPerTransaction" DECIMAL(18,2) NOT NULL,
    "approvalThreshold" DECIMAL(18,2),
    "maxTransactions" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "delegationAllowed" BOOLEAN NOT NULL DEFAULT false,
    "status" "MandateStatus" NOT NULL DEFAULT 'ACTIVE',
    "signature" TEXT NOT NULL,
    "signingKeyId" TEXT NOT NULL,
    "canonicalHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MandateScope" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "type" "ScopeType" NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,

    CONSTRAINT "MandateScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "merchantId" TEXT,
    "merchantDomain" TEXT,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "description" TEXT NOT NULL,
    "lineItems" JSONB NOT NULL,
    "source" "ProposalSource" NOT NULL DEFAULT 'AGENT',
    "status" "ProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "aiModel" TEXT,
    "aiRationale" TEXT,
    "rawInstruction" TEXT,
    "signature" TEXT NOT NULL,
    "canonicalHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDecision" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "outcome" "PolicyOutcome" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "checks" JSONB NOT NULL,
    "failedChecks" TEXT[],
    "explanation" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "approvalId" TEXT,
    "decisionLatency" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "merchantId" TEXT,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "policyDecisionId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'POLICY_APPROVED',
    "source" "ProposalSource" NOT NULL DEFAULT 'AGENT',
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "paypalStatus" TEXT,
    "capturedAmount" DECIMAL(18,2),
    "paypalFeeAmount" DECIMAL(18,2),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "auditRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceId" TEXT,
    "resourceType" TEXT,
    "ownerId" TEXT,
    "status" "WebhookStatus" NOT NULL DEFAULT 'PROCESSED',
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "prevHash" TEXT,
    "signature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttackRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "threatClass" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "decisionId" TEXT,
    "proposalId" TEXT,
    "checks" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttackRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Agent_ownerId_idx" ON "Agent"("ownerId");

-- CreateIndex
CREATE INDEX "Agent_parentAgentId_idx" ON "Agent"("parentAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_ownerId_name_key" ON "Agent"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Mandate_mandateId_key" ON "Mandate"("mandateId");

-- CreateIndex
CREATE UNIQUE INDEX "Mandate_nonce_key" ON "Mandate"("nonce");

-- CreateIndex
CREATE INDEX "Mandate_ownerId_status_idx" ON "Mandate"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Mandate_ownerId_expiresAt_idx" ON "Mandate"("ownerId", "expiresAt");

-- CreateIndex
CREATE INDEX "Mandate_agentId_idx" ON "Mandate"("agentId");

-- CreateIndex
CREATE INDEX "Mandate_parentMandateId_idx" ON "Mandate"("parentMandateId");

-- CreateIndex
CREATE INDEX "MandateScope_mandateId_type_idx" ON "MandateScope"("mandateId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "MandateScope_mandateId_type_normalizedValue_key" ON "MandateScope"("mandateId", "type", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_proposalId_key" ON "Proposal"("proposalId");

-- CreateIndex
CREATE INDEX "Proposal_ownerId_createdAt_idx" ON "Proposal"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Proposal_mandateId_createdAt_idx" ON "Proposal"("mandateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDecision_decisionId_key" ON "PolicyDecision"("decisionId");

-- CreateIndex
CREATE INDEX "PolicyDecision_ownerId_createdAt_idx" ON "PolicyDecision"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "PolicyDecision_mandateId_createdAt_idx" ON "PolicyDecision"("mandateId", "createdAt");

-- CreateIndex
CREATE INDEX "PolicyDecision_proposalId_idx" ON "PolicyDecision"("proposalId");

-- CreateIndex
CREATE INDEX "PolicyDecision_outcome_idx" ON "PolicyDecision"("outcome");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transactionId_key" ON "Transaction"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_proposalId_key" ON "Transaction"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_policyDecisionId_key" ON "Transaction"("policyDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_executionId_key" ON "Transaction"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_paypalOrderId_key" ON "Transaction"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_paypalCaptureId_key" ON "Transaction"("paypalCaptureId");

-- CreateIndex
CREATE INDEX "Transaction_ownerId_createdAt_idx" ON "Transaction"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_mandateId_status_idx" ON "Transaction"("mandateId", "status");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_paypalOrderId_idx" ON "Transaction"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_approvalId_key" ON "ApprovalRequest"("approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_proposalId_key" ON "ApprovalRequest"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_tokenHash_key" ON "ApprovalRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "ApprovalRequest_ownerId_status_idx" ON "ApprovalRequest"("ownerId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_proposalId_idx" ON "ApprovalRequest"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_eventType_idx" ON "WebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "WebhookEvent_resourceId_idx" ON "WebhookEvent"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_eventId_key" ON "AuditEvent"("eventId");

-- CreateIndex
CREATE INDEX "AuditEvent_ownerId_createdAt_idx" ON "AuditEvent"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceId_idx" ON "AuditEvent"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AttackRun_runId_key" ON "AttackRun"("runId");

-- CreateIndex
CREATE INDEX "AttackRun_ownerId_executedAt_idx" ON "AttackRun"("ownerId", "executedAt");

-- CreateIndex
CREATE INDEX "AttackRun_scenario_idx" ON "AttackRun"("scenario");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_ownerId_key_key" ON "IdempotencyKey"("ownerId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_sku_key" ON "CatalogItem"("sku");

-- CreateIndex
CREATE INDEX "CatalogItem_category_idx" ON "CatalogItem"("category");

-- CreateIndex
CREATE INDEX "CatalogItem_merchant_idx" ON "CatalogItem"("merchant");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_parentAgentId_fkey" FOREIGN KEY ("parentAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_rootAgentId_fkey" FOREIGN KEY ("rootAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_parentMandateId_fkey" FOREIGN KEY ("parentMandateId") REFERENCES "Mandate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MandateScope" ADD CONSTRAINT "MandateScope_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDecision" ADD CONSTRAINT "PolicyDecision_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDecision" ADD CONSTRAINT "PolicyDecision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDecision" ADD CONSTRAINT "PolicyDecision_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_policyDecisionId_fkey" FOREIGN KEY ("policyDecisionId") REFERENCES "PolicyDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttackRun" ADD CONSTRAINT "AttackRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

