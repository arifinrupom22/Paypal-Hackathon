import { createHash } from "node:crypto";

/**
 * Deterministic JSON serialization used for every signed PACT artifact:
 * object keys are sorted recursively, undefined values are dropped, dates are
 * converted to ISO-8601 UTC strings. Both signing and verification use this
 * exact function so byte-level drift is impossible.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] === undefined) continue;
      sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Cannot canonicalize a non-finite number");
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function sha256Base64(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("base64");
}
