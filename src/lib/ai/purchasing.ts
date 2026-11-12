import "server-only";
import { z } from "zod";
import { generateObject } from "ai";
import { geminiModel, GEMINI_MODEL, isGeminiConfigured } from "./gemini";
import type { CatalogItem } from "@prisma/client";

const selectionSchema = z.object({
  sku: z.string().min(1),
  rationale: z.string().min(3).max(500),
});

export interface CatalogSelection {
  item: CatalogItem;
  rationale: string;
  engine: "gemini" | "deterministic";
  model: string;
  configured: boolean;
}

/**
 * The model may only choose a SKU from the catalog. The amount, merchant and
 * category are always read from the database row, never from model output.
 */
export async function selectCatalogItem(input: {
  instruction: string;
  items: CatalogItem[];
}): Promise<CatalogSelection | null> {
  if (input.items.length === 0) return null;

  const model = geminiModel();
  if (model) {
    try {
      const { object } = await generateObject({
        model,
        schema: selectionSchema,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(30_000),
        system:
          "You select one product from a fixed catalog for an autonomous purchasing agent. You cannot set prices or authorize payment. Respond only with a catalog SKU and a short rationale.",
        prompt: [
          `Instruction: ${input.instruction}`,
          "Catalog:",
          ...input.items.map(
            (item) =>
              `- ${item.sku} | ${item.name} | ${item.merchant} | ${item.category} | ${item.price} ${item.currency}`,
          ),
        ].join("\n"),
      });
      const item = input.items.find((entry) => entry.sku === object.sku);
      if (item) {
        return {
          item,
          rationale: object.rationale,
          engine: "gemini",
          model: GEMINI_MODEL,
          configured: true,
        };
      }
    } catch (error) {
      console.error("[pact:purchasing] Gemini selection failed, falling back", error);
    }
  }

  const fallback = keywordSelect(input.instruction, input.items);
  if (!fallback) return null;
  return {
    item: fallback,
    rationale: `Matched "${fallback.name}" from ${fallback.merchant} using deterministic keyword scoring. Review before authorizing.`,
    engine: "deterministic",
    model: "pact-deterministic-selector",
    configured: isGeminiConfigured(),
  };
}

function keywordSelect(instruction: string, items: CatalogItem[]): CatalogItem | null {
  const tokens = instruction
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);

  let best: { item: CatalogItem; score: number } | null = null;
  for (const item of items) {
    const haystack = `${item.name} ${item.merchant} ${item.category} ${item.description}`.toLowerCase();
    const score = tokens.reduce((total, token) => (haystack.includes(token) ? total + 1 : total), 0);
    if (!best || score > best.score) best = { item, score };
  }
  return best?.item ?? null;
}
