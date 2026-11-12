import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(200, "Password is too long.");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  email: emailSchema,
  organization: z.string().trim().max(120).optional().or(z.literal("")),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value), "Use a three-letter ISO currency code.");

const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,15}(\.\d{1,2})?$/, "Use a positive amount with at most two decimals.")
  .refine((value) => Number(value) > 0, "Amount must be greater than zero.");

export const agentCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).optional().or(z.literal("")),
  parentAgentId: z.string().trim().min(1).optional().nullable(),
});

export const mandateDraftSchema = z.object({
  title: z.string().trim().min(3, "Give the mandate a title.").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  agentId: z.string().trim().min(1, "Select an agent."),
  currency: currencySchema.default("USD"),
  maxTotal: amountSchema,
  maxPerTransaction: amountSchema,
  approvalThreshold: amountSchema.optional().nullable(),
  maxTransactions: z.coerce.number().int().min(1).max(10000),
  expiresAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  delegationAllowed: z.boolean().default(false),
  merchants: z.array(z.string().trim().min(1)).min(1, "Add at least one approved merchant."),
  categories: z.array(z.string().trim().min(1)).min(1, "Add at least one allowed category."),
  parentMandateId: z.string().trim().min(1).optional().nullable(),
});

export const mandateCreateSchema = mandateDraftSchema.superRefine((value, ctx) => {
  if (value.approvalThreshold && Number(value.approvalThreshold) > Number(value.maxPerTransaction)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["approvalThreshold"],
      message: "Step-up threshold cannot exceed the per-transaction ceiling.",
    });
  }
  if (Number(value.maxPerTransaction) > Number(value.maxTotal)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxPerTransaction"],
      message: "Per-transaction ceiling cannot exceed the total ceiling.",
    });
  }
  if (new Date(value.expiresAt).getTime() <= Date.now() + 30_000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expiresAt"],
      message: "Expiry must be at least 30 seconds in the future.",
    });
  }
});

export const parseIntentSchema = z.object({
  instruction: z.string().trim().min(10, "Describe the purchase intent.").max(2000),
  agentId: z.string().trim().min(1).optional().nullable(),
});

export const delegateSchema = z.object({
  agentId: z.string().trim().min(1),
  title: z.string().trim().min(3).max(120),
  maxTotal: amountSchema,
  maxPerTransaction: amountSchema,
  maxTransactions: z.coerce.number().int().min(1).max(10000),
  expiresAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  merchants: z.array(z.string().trim().min(1)).min(1),
  categories: z.array(z.string().trim().min(1)).min(1),
});

export const revokeSchema = z.object({
  reason: z.string().trim().max(400).optional().or(z.literal("")),
});

export const proposalSchema = z.object({
  mandateId: z.string().trim().min(1),
  agentId: z.string().trim().min(1).optional(),
  merchantName: z.string().trim().min(1).max(160),
  merchantId: z.string().trim().max(120).optional().nullable(),
  merchantDomain: z.string().trim().max(160).optional().nullable(),
  category: z.string().trim().min(1).max(80),
  amount: amountSchema,
  currency: currencySchema,
  description: z.string().trim().min(3).max(1000),
  lineItems: z.array(z.record(z.unknown())).max(50).default([]),
  source: z.enum(["AGENT", "MANUAL"]).default("MANUAL"),
});

export const agentProposalSchema = z.object({
  instruction: z.string().trim().min(5).max(1000),
  mandateId: z.string().trim().min(1),
  sku: z.string().trim().min(1).optional(),
});

export const policyEvaluateSchema = z.object({
  proposalId: z.string().trim().min(1),
  executionId: z.string().trim().min(8).max(120),
  idempotencyKey: z.string().trim().min(8).max(120),
  approvalId: z.string().trim().min(1).optional().nullable(),
});

export const createOrderSchema = z.object({
  transactionId: z.string().trim().min(1),
});

export const attackRunSchema = z.object({
  scenario: z.enum([
    "budget_manipulation",
    "prompt_injection",
    "token_replay",
    "merchant_substitution",
    "forged_approval",
    "expired_mandate",
    "revoked_parent",
    "concurrent_spending",
  ]),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  organization: z.string().trim().max(120).optional().or(z.literal("")),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
