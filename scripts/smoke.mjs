// End-to-end API smoke: registers an owner, signs a mandate, runs the agent
// proposal through the policy engine, verifies PayPal configuration handling
// and executes security scenarios. Prints each observed result.
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let cookies = new Map();

function cookieHeader() {
  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function storeCookies(response) {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const raw of setCookies) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

async function call(path, { method = "GET", body, csrf = true, raw = false } = {}) {
  const headers = { Origin: BASE };
  if (cookies.size > 0) headers.Cookie = cookieHeader();
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrf && cookies.get("pact_csrf")) headers["x-pact-csrf"] = cookies.get("pact_csrf");

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  storeCookies(response);

  if (raw) return { status: response.status, text: await response.text(), headers: response.headers };
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

function report(label, value) {
  console.log(`\n▸ ${label}`);
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

const email = `smoke.${Date.now()}@apex.test`;
const password = "enclave-smoke-passphrase-2026";

const register = await call("/api/auth/register", {
  method: "POST",
  body: { name: "Smoke Operator", email, organization: "Apex Systems", password },
});
report("register", { status: register.status, ok: register.json?.ok });

const agent = await call("/api/agents", {
  method: "POST",
  body: { name: "ProcureMaster-Root", description: "Smoke harness agent" },
});
report("agent", { status: agent.status, tier: agent.json?.data?.agent?.tier });
const agentId = agent.json?.data?.agent?.id;

const parse = await call("/api/mandates/parse", {
  method: "POST",
  body: {
    instruction:
      "Buy a laptop stand under $50 from Northline Supply Co. in the Office Hardware category. Allow one transaction within 24 hours.",
  },
});
const draft = parse.json?.data?.draft;
report("intent parse", {
  status: parse.status,
  engine: parse.json?.data?.parser?.engine,
  maxTotal: draft?.maxTotal,
  merchants: draft?.merchants,
  categories: draft?.categories,
  maxTransactions: draft?.maxTransactions,
});

const mandate = await call("/api/mandates", {
  method: "POST",
  body: {
    title: draft?.title ?? "Laptop stand mandate",
    description: draft?.description ?? "",
    agentId,
    currency: draft?.currency ?? "USD",
    maxTotal: draft?.maxTotal ?? "50.00",
    maxPerTransaction: draft?.maxPerTransaction ?? "50.00",
    maxTransactions: draft?.maxTransactions ?? 1,
    expiresAt: draft?.expiresAt ?? new Date(Date.now() + 86400_000).toISOString(),
    delegationAllowed: false,
    merchants: draft?.merchants ?? ["Northline Supply Co."],
    categories: draft?.categories ?? ["Office Hardware"],
  },
});
const mandateId = mandate.json?.data?.mandateId;
report("mandate signed", { status: mandate.status, mandateId });
const mandateDbId = mandate.json?.data?.id;

const proposal = await call("/api/proposals", {
  method: "POST",
  body: {
    instruction: "Buy the anodised aluminium laptop stand from Northline Supply Co.",
    mandateId: mandateDbId,
  },
});
report("agent proposal", {
  status: proposal.status,
  proposalId: proposal.json?.data?.proposal?.proposalId,
  amount: proposal.json?.data?.proposal?.amount,
  merchant: proposal.json?.data?.proposal?.merchant,
  selectionEngine: proposal.json?.data?.selection?.engine,
});
const proposalId = proposal.json?.data?.proposal?.id;

const evaluation = await call("/api/policy/evaluate", {
  method: "POST",
  body: {
    proposalId,
    executionId: `exec_smoke_${Date.now()}`,
    idempotencyKey: `idem_smoke_${Date.now()}`,
  },
});
report("policy evaluation", {
  status: evaluation.status,
  outcome: evaluation.json?.data?.outcome,
  transactionId: evaluation.json?.data?.transactionId,
  checks: evaluation.json?.data?.decision?.checks?.length,
  failed: evaluation.json?.data?.decision?.failedCheckIds,
});

const order = await call("/api/payments/create-order", {
  method: "POST",
  body: { transactionId: evaluation.json?.data?.transactionId ?? "missing" },
});
report("PayPal order without credentials", {
  status: order.status,
  error: order.json?.error?.code,
  message: order.json?.error?.message,
});

const cancel = await call(`/api/payments/${evaluation.json?.data?.transactionId}/cancel`, {
  method: "POST",
  body: {},
});
report("release reservation by transaction id", {
  status: cancel.status,
  error: cancel.json?.error?.code,
});

const replayCapture = await call(`/api/payments/${evaluation.json?.data?.transactionId}/capture`, {
  method: "POST",
  body: {},
});
report("capture after release", {
  status: replayCapture.status,
  error: replayCapture.json?.error?.code,
});

const forgedWebhook = await call("/api/webhooks/paypal", {
  method: "POST",
  csrf: false,
  body: {
    id: `WH-FORGED-${Date.now()}`,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: "CAP-FORGED",
      status: "COMPLETED",
      amount: { value: "40.00", currency_code: "USD" },
      supplementary_data: { related_ids: { order_id: "ORDER-FORGED" } },
    },
  },
});
report("unverified webhook", {
  status: forgedWebhook.status,
  error: forgedWebhook.json?.error?.code,
});

for (const scenario of ["budget_manipulation", "forged_approval", "concurrent_spending"]) {
  const run = await call("/api/attacks/run", { method: "POST", body: { scenario } });
  report(`attack: ${scenario}`, {
    status: run.status,
    boundary: run.json?.data?.run?.status,
    outcome: run.json?.data?.run?.outcome,
    checks: run.json?.data?.run?.checks?.length,
    durationMs: run.json?.data?.run?.durationMs,
  });
}

const pages = ["/", "/mandates", "/mandates/new", "/agents", "/security", "/payments", "/transactions", "/audit", "/settings"];
for (const page of pages) {
  const response = await call(page, { raw: true });
  const broken = /Application error|Internal Server Error|__next_error__/i.test(response.text);
  report(`page ${page}`, { status: response.status, broken });
}

const analytics = await call("/api/analytics");
report("analytics", {
  status: analytics.status,
  metrics: analytics.json?.data?.metrics,
});

const audit = await call("/api/audit?pageSize=10");
report("audit chain", {
  status: audit.status,
  total: audit.json?.data?.total,
  chain: audit.json?.data?.chain,
});

const logout = await call("/api/auth/logout", { method: "POST", body: {} });
report("logout", { status: logout.status });

const unauth = await call("/api/mandates");
report("unauthenticated access", { status: unauth.status, error: unauth.json?.error?.code });

const unauthOrder = await call("/api/payments/create-order", {
  method: "POST",
  body: { transactionId: evaluation.json?.data?.transactionId ?? "missing" },
});
report("unauthenticated payment request", {
  status: unauthOrder.status,
  error: unauthOrder.json?.error?.code,
});
