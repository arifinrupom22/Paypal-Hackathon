import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { db } from "../db";
import { geminiModel, GEMINI_MODEL, isGeminiConfigured } from "./gemini";

const intentSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(500),
  currency: z.string().length(3),
  maxTotal: z.string().regex(/^\d+(\.\d{1,2})?$/),
  maxPerTransaction: z.string().regex(/^\d+(\.\d{1,2})?$/),
  maxTransactions: z.number().int().min(1).max(100),
  durationHours: z.number().min(1).max(2160),
  merchants: z.array(z.string().min(1)).min(1).max(20),
  categories: z.array(z.string().min(1)).min(1).max(20),
  delegationAllowed: z.boolean(),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(500),
});

export type ParsedIntent = z.infer<typeof intentSchema>;

export interface ParsedMandateDraft extends ParsedIntent {
  expiresAt: string;
  approvalThreshold: string | null;
}

export interface ParseResult {
  draft: ParsedMandateDraft;
  parser: { engine: "gemini" | "deterministic"; model: string; configured: boolean };
}

interface CatalogReference {
  merchants: string[];
  categories: string[];
}

async function catalogReference(): Promise<CatalogReference> {
  const items = await db.catalogItem.findMany({ select: { merchant: true, category: true } });
  return {
    merchants: Array.from(new Set(items.map((item) => item.merchant))).slice(0, 60),
    categories: Array.from(new Set(items.map((item) => item.category))).slice(0, 60),
  };
}

export async function parseMandateIntent(instruction: string): Promise<ParseResult> {
  const reference = await catalogReference();
  const model = geminiModel();

  if (model) {
    try {
      const { object } = await generateObject({
        model,
        schema: intentSchema,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(30_000),
        system: [
          "You convert a user's purchasing instruction into a constrained spending mandate.",
          "You are not an authorization authority: you only propose limits for the user to review.",
          "Never invent merchants outside the supplied catalog when a close match exists.",
          "All monetary ceilings must be explicit numbers rounded to two decimals.",
          "If the instruction omits a limit, choose the most restrictive plausible value.",
        ].join(" "),
        prompt: [
          `Instruction: ${instruction}`,
          `Known merchants: ${reference.merchants.join(", ") || "none"}`,
          `Known categories: ${reference.categories.join(", ") || "none"}`,
          "Return a mandate title, total ceiling, per-transaction ceiling, transaction count, duration in hours,",
          "approved merchant names, allowed categories, delegation permission, confidence, and short notes.",
        ].join("\n"),
      });
      const draft = normalize(object);
      return {
        draft,
        parser: { engine: "gemini", model: GEMINI_MODEL, configured: true },
      };
    } catch (error) {
      console.error("[pact:intent] Gemini parsing failed, falling back", error);
    }
  }

  return {
    draft: normalize(heuristicParse(instruction, reference)),
    parser: {
      engine: "deterministic",
      model: "pact-deterministic-parser",
      configured: isGeminiConfigured(),
    },
  };
}

function normalize(intent: ParsedIntent): ParsedMandateDraft {
  const maxTotal = Number(intent.maxTotal);
  const perTransaction = Math.min(Number(intent.maxPerTransaction), maxTotal);
  const expiresAt = new Date(Date.now() + intent.durationHours * 60 * 60 * 1000).toISOString();
  return {
    ...intent,
    currency: intent.currency.toUpperCase(),
    maxTotal: maxTotal.toFixed(2),
    maxPerTransaction: perTransaction.toFixed(2),
    merchants: Array.from(new Set(intent.merchants.map((value) => value.trim()))).slice(0, 20),
    categories: Array.from(new Set(intent.categories.map((value) => value.trim()))).slice(0, 20),
    expiresAt,
    approvalThreshold: null,
  };
}

function heuristicParse(instruction: string, reference: CatalogReference): ParsedIntent {
  const lower = instruction.toLowerCase();
  // Only currency-marked amounts count. Otherwise a duration like "24 hours"
  // would be misread as a spending ceiling.
  const marked = Array.from(
    instruction.matchAll(
      /\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s?(?:usd|dollars?)\b/gi,
    ),
  ).map((match) => Number((match[1] ?? match[2]).replace(/,/g, "")));

  const unmarked = Array.from(
    instruction.matchAll(/(?<![\w.$])([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?!\s*(?:hours?|hrs?|h|days?|weeks?|months?|transactions?|purchases?|orders?)\b)/gi),
  ).map((match) => Number(match[1].replace(/,/g, "")));

  const moneyMatches = (marked.length > 0 ? marked : unmarked).filter(
    (value) => Number.isFinite(value) && value > 0 && value < 1_000_000,
  );

  const maxTotal = moneyMatches[0] ?? 100;
  const perTransaction =
    moneyMatches.slice(1).find((value) => value <= maxTotal) ?? maxTotal;

  const txMatch = lower.match(/(\d+)\s*(?:transactions?|purchases?|orders?)/);
  const maxTransactions = txMatch ? Math.max(1, Math.min(100, Number(txMatch[1]))) : 1;

  const hourMatch = lower.match(/(\d+)\s*(?:hours?|hrs?|h)\b/);
  const dayMatch = lower.match(/(\d+)\s*days?\b/);
  const durationHours = dayMatch
    ? Math.min(2160, Math.max(1, Number(dayMatch[1]) * 24))
    : hourMatch
      ? Math.min(2160, Math.max(1, Number(hourMatch[1])))
      : 24;

  const merchants = reference.merchants.filter((merchant) =>
    lower.includes(merchant.toLowerCase()),
  );
  if (merchants.length === 0) {
    const approvedHint = /approved merchants?|approved providers?|allowlist/.test(lower);
    if (approvedHint && reference.merchants.length > 0) {
      merchants.push(...reference.merchants.slice(0, 3));
    }
  }
  if (merchants.length === 0) merchants.push("Lambda Labs, Inc.");

  const categories = reference.categories.filter((category) =>
    lower.includes(category.toLowerCase()),
  );
  if (categories.length === 0) categories.push("Cloud Compute");

  const title = instruction
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[.,;:]$/, "");

  return {
    title: title.length >= 3 ? title : "Autonomous purchase mandate",
    description: instruction.slice(0, 400),
    currency: "USD",
    maxTotal: maxTotal.toFixed(2),
    maxPerTransaction: perTransaction.toFixed(2),
    maxTransactions,
    durationHours,
    merchants: Array.from(new Set(merchants)).slice(0, 20),
    categories: Array.from(new Set(categories)).slice(0, 20),
    delegationAllowed: false,
    confidence: 0.55,
    notes:
      "Deterministic parse from explicit amounts, merchants and time windows in the instruction. Review every field before signing.",
  };
}
