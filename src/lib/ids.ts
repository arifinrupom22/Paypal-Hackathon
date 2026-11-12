import { randomBytes, randomUUID } from "node:crypto";

const PREFIXES = {
  mandate: "mnd",
  agent: "agt",
  proposal: "prop",
  decision: "dec",
  transaction: "tx",
  audit: "aud",
  attack: "run",
  approval: "apv",
  webhook: "whk",
  project: "pact",
} as const;

export type IdKind = keyof typeof PREFIXES;

export function newId(kind: IdKind): string {
  return `${PREFIXES[kind]}_${randomBytes(9).toString("base64url")}`;
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

export function newExecutionId(): string {
  return `exec_${randomBytes(12).toString("base64url")}`;
}

export function uuid(): string {
  return randomUUID();
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
