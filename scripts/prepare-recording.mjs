// Creates a fresh, isolated presentation account through the real PACT API.
// Every mandate, proposal, policy decision, attack run and audit event is genuine.
// This script never enables PayPal mock mode and never fabricates a settlement.
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = "pact-recording-passphrase-2026";

function cookieHeader(cookies) {
  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function call(path, { method = "GET", body, cookies, csrf = true } = {}) {
  const headers = { Origin: BASE };
  if (cookies?.size) headers.Cookie = cookieHeader(cookies);
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrf && cookies?.get("pact_csrf")) headers["x-pact-csrf"] = cookies.get("pact_csrf");

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });

  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const raw of setCookies) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    cookies?.set(pair.slice(0, index), pair.slice(index + 1));
  }

  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

const cookies = new Map();
const email = `presentation.${Date.now()}@apex.test`;

const register = await call("/api/auth/register", {
  method: "POST",
  cookies,
  body: {
    name: "Kiran Patel",
    organization: "Apex Systems",
    email,
    password: PASSWORD,
  },
});
if (register.status !== 201) {
  throw new Error(`Registration failed: ${register.status} ${JSON.stringify(register.json)}`);
}
console.log(`Registered recording owner: ${email}`);

const agentResult = await call("/api/agents", {
  method: "POST",
  cookies,
  body: {
    name: "ProcureMaster-Root",
    description: "Owner-issued procurement identity for approved office hardware.",
  },
});
if (agentResult.status !== 201) {
  throw new Error(`Agent creation failed: ${agentResult.status} ${JSON.stringify(agentResult.json)}`);
}
const agentId = agentResult.json.data.agent.id;

const mandateResult = await call("/api/mandates", {
  method: "POST",
  cookies,
  body: {
    title: "Northline equipment renewal mandate",
    description: "Owner-signed authority for approved office-hardware renewals.",
    agentId,
    currency: "USD",
    maxTotal: "200.00",
    maxPerTransaction: "50.00",
    maxTransactions: 4,
    expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    delegationAllowed: false,
    merchants: ["Northline Supply Co."],
    categories: ["Office Hardware"],
  },
});
if (mandateResult.status !== 201) {
  throw new Error(`Mandate creation failed: ${mandateResult.status} ${JSON.stringify(mandateResult.json)}`);
}
const mandate = mandateResult.json.data;
console.log(`Signed mandate: ${mandate.mandateId}`);

const proposalResult = await call("/api/proposals", {
  method: "POST",
  cookies,
  body: {
    instruction: "Buy the anodised aluminium laptop stand from Northline Supply Co.",
    mandateId: mandate.id,
  },
});
if (proposalResult.status !== 201) {
  throw new Error(`Proposal creation failed: ${proposalResult.status} ${JSON.stringify(proposalResult.json)}`);
}
const proposal = proposalResult.json.data.proposal;

const evaluationResult = await call("/api/policy/evaluate", {
  method: "POST",
  cookies,
  body: {
    proposalId: proposal.id,
    executionId: `exec_recording_${Date.now()}`,
    idempotencyKey: `idem_recording_${Date.now()}`,
  },
});
if (
  evaluationResult.status !== 200 ||
  evaluationResult.json?.data?.outcome !== "AUTHORIZED"
) {
  throw new Error(
    `Authorized evaluation failed: ${evaluationResult.status} ${JSON.stringify(evaluationResult.json)}`,
  );
}
const evaluation = evaluationResult.json.data;
console.log(`Authorized transaction: ${evaluation.transactionId}`);

const scenarios = [
  "budget_manipulation",
  "prompt_injection",
  "token_replay",
  "merchant_substitution",
  "forged_approval",
  "expired_mandate",
  "revoked_parent",
  "concurrent_spending",
];
const attacks = [];
for (const scenario of scenarios) {
  const result = await call("/api/attacks/run", {
    method: "POST",
    cookies,
    body: { scenario },
  });
  const run = result.json?.data?.run;
  if (result.status !== 201 || !run) {
    throw new Error(`Scenario ${scenario} failed: ${result.status} ${JSON.stringify(result.json)}`);
  }
  attacks.push({ scenario, status: run.status, outcome: run.outcome });
  console.log(`${scenario}: ${run.status} | ${run.outcome}`);
  if (run.status !== "BOUNDARY_HELD") {
    throw new Error(`Scenario ${scenario} did not hold the boundary`);
  }
}

const analytics = await call("/api/analytics", { cookies });
const audit = await call("/api/audit?pageSize=3", { cookies });
if (!audit.json?.data?.chain?.valid) {
  throw new Error("Audit chain did not verify after recording preparation");
}

await mkdir("test-results", { recursive: true });
const account = {
  baseUrl: BASE,
  email,
  password: PASSWORD,
  name: "Kiran Patel",
  organization: "Apex Systems",
  agentId,
  mandateDbId: mandate.id,
  mandateId: mandate.mandateId,
  transactionId: evaluation.transactionId,
  authorizedChecks: evaluation.decision?.checks?.length ?? null,
  attacks,
  metrics: analytics.json?.data?.metrics ?? null,
  audit: audit.json?.data?.chain ?? null,
  note:
    "Local presentation account created through the real PACT API. Test-only credentials; do not reuse outside this workspace.",
};
await writeFile("test-results/presentation-account.json", JSON.stringify(account, null, 2));
console.log(JSON.stringify(account, null, 2));
