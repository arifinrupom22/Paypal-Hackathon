// Loopback-only payment lifecycle test. The app under test must be started
// with PACT_ALLOW_PAYPAL_MOCK=1 and PACT_PAYPAL_MOCK_URL set to mock-paypal.mjs.
// This exercises PACT's real API, database, policy, state machine and audit
// path; only the PayPal network boundary is mocked. It is not live evidence.
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3102";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:4100";

class Session {
  constructor() {
    this.cookies = new Map();
  }

  header() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  store(response) {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  async call(path, { method = "GET", body, csrf = true, headers = {} } = {}) {
    const requestHeaders = { Origin: BASE, ...headers };
    if (this.cookies.size > 0) requestHeaders.Cookie = this.header();
    if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
    if (csrf && this.cookies.get("pact_csrf")) {
      requestHeaders["x-pact-csrf"] = this.cookies.get("pact_csrf");
    }
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    this.store(response);
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Keep the status assertion useful for non-JSON failures.
    }
    return { status: response.status, json, text };
  }
}

async function setCaptureMode(captureMode) {
  const response = await fetch(`${MOCK}/__control`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ captureMode }),
  });
  assert.equal(response.status, 200);
}

function report(label, value) {
  console.log(`\n✓ ${label}`);
  if (value !== undefined) console.log(JSON.stringify(value, null, 2));
}

async function createTransaction(session, { mandateId, amount, merchant = "Northline Supply Co." }) {
  const proposal = await session.call("/api/proposals", {
    method: "POST",
    body: {
      mandateId,
      merchantName: merchant,
      category: "Office Hardware",
      amount,
      currency: "USD",
      description: `Mock lifecycle purchase of ${amount} USD`,
      source: "MANUAL",
    },
  });
  assert.equal(proposal.status, 201, proposal.text);
  const evaluation = await session.call("/api/policy/evaluate", {
    method: "POST",
    body: {
      proposalId: proposal.json.data.proposal.id,
      executionId: `exec_mock_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      idempotencyKey: `idem_mock_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    },
  });
  assert.equal(evaluation.status, 200, evaluation.text);
  const transaction = evaluation.json.data;
  assert.ok(transaction.transactionId, "policy evaluation must create a transaction");
  return transaction;
}

const owner = new Session();
const email = `mock.paypal.${Date.now()}@apex.test`;
const registration = await owner.call("/api/auth/register", {
  method: "POST",
  body: {
    name: "Mock Lifecycle Owner",
    email,
    organization: "Apex Systems",
    password: "mock-lifecycle-passphrase-2026",
  },
});
assert.equal(registration.status, 201, registration.text);

const agent = await owner.call("/api/agents", {
  method: "POST",
  body: { name: `Mock Agent ${Date.now()}`, description: "Payment lifecycle harness" },
});
assert.equal(agent.status, 201, agent.text);
const agentId = agent.json.data.agent.id;

const mandate = await owner.call("/api/mandates", {
  method: "POST",
  body: {
    title: "Mock payment lifecycle mandate",
    agentId,
    currency: "USD",
    maxTotal: "100.00",
    maxPerTransaction: "50.00",
    maxTransactions: 4,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    delegationAllowed: false,
    merchants: ["Northline Supply Co."],
    categories: ["Office Hardware"],
  },
});
assert.equal(mandate.status, 201, mandate.text);
const mandateId = mandate.json.data.id;
report("account, agent and signed mandate", { email, agentId, mandateId });

const first = await createTransaction(owner, { mandateId, amount: "40.00" });
const order = await owner.call("/api/payments/create-order", {
  method: "POST",
  body: { transactionId: first.transactionId },
});
assert.equal(order.status, 200, order.text);
assert.match(order.json.data.orderId, /^MOCK-ORDER-/);
assert.match(order.json.data.approveUrl, new RegExp(`^${MOCK}/approve/`));
assert.equal(order.json.data.paypalEnvironment, "sandbox");
report("order created through PayPal adapter", order.json.data);

const capture = await owner.call(`/api/payments/${first.transactionId}/capture`, {
  method: "POST",
  body: {},
});
assert.equal(capture.status, 200, capture.text);
assert.equal(capture.json.data.status, "SETTLED");
assert.equal(capture.json.data.capturedAmount, "40.00");
assert.equal(capture.json.data.currency, "USD");
report("capture verified and settled", capture.json.data);

const replay = await owner.call(`/api/payments/${first.transactionId}/capture`, {
  method: "POST",
  body: {},
});
assert.equal(replay.status, 409);
assert.equal(replay.json.error.code, "ALREADY_CAPTURED");
report("replayed capture rejected", replay.json.error.code);

const duplicateOrder = await owner.call("/api/payments/create-order", {
  method: "POST",
  body: { transactionId: first.transactionId },
});
assert.equal(duplicateOrder.status, 409);
assert.equal(duplicateOrder.json.error.code, "ORDER_EXISTS");
report("duplicate order rejected", duplicateOrder.json.error.code);

const webhookEvent = {
  id: `WH-MOCK-${Date.now()}`,
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource_type: "capture",
  resource: {
    id: capture.json.data.captureId,
    status: "COMPLETED",
    amount: { value: "40.00", currency_code: "USD" },
    supplementary_data: { related_ids: { order_id: order.json.data.orderId } },
  },
};
const webhookHeaders = {
  "paypal-transmission-id": `tx-${Date.now()}`,
  "paypal-transmission-time": new Date().toISOString(),
  "paypal-transmission-sig": "valid",
  "paypal-cert-url": "http://127.0.0.1:4100/cert",
  "paypal-auth-algo": "SHA256withRSA",
};
const webhook1 = await owner.call("/api/webhooks/paypal", {
  method: "POST",
  csrf: false,
  headers: webhookHeaders,
  body: webhookEvent,
});
assert.equal(webhook1.status, 200, webhook1.text);
assert.equal(webhook1.json.data.status, "processed");
const webhook2 = await owner.call("/api/webhooks/paypal", {
  method: "POST",
  csrf: false,
  headers: webhookHeaders,
  body: webhookEvent,
});
assert.equal(webhook2.status, 200, webhook2.text);
assert.equal(webhook2.json.data.status, "duplicate");
report("verified webhook deduplicated", [webhook1.json.data.status, webhook2.json.data.status]);

const forged = await owner.call("/api/webhooks/paypal", {
  method: "POST",
  csrf: false,
  headers: { ...webhookHeaders, "paypal-transmission-sig": "forged" },
  body: { ...webhookEvent, id: `WH-FORGED-${Date.now()}` },
});
assert.equal(forged.status, 400);
assert.equal(forged.json.error.code, "WEBHOOK_REJECTED");
report("forged webhook rejected before mutation", forged.json.error.code);

const second = await createTransaction(owner, { mandateId, amount: "45.00" });
const secondOrder = await owner.call("/api/payments/create-order", {
  method: "POST",
  body: { transactionId: second.transactionId },
});
assert.equal(secondOrder.status, 200, secondOrder.text);
await setCaptureMode("mismatch");
const mismatch = await owner.call(`/api/payments/${second.transactionId}/capture`, {
  method: "POST",
  body: {},
});
assert.equal(mismatch.status, 409, mismatch.text);
assert.equal(mismatch.json.error.code, "CAPTURE_AMOUNT_MISMATCH");
const mismatchReplay = await owner.call(`/api/payments/${second.transactionId}/capture`, {
  method: "POST",
  body: {},
});
assert.equal(mismatchReplay.status, 409);
assert.equal(mismatchReplay.json.error.code, "CAPTURE_RECONCILIATION_REQUIRED");
const mismatchCancel = await owner.call(`/api/payments/${second.transactionId}/cancel`, {
  method: "POST",
  body: {},
});
assert.equal(mismatchCancel.status, 409);
assert.equal(mismatchCancel.json.error.code, "RESERVATION_NOT_RELEASABLE");
const mismatchReconcile = await owner.call(`/api/payments/${second.transactionId}/reconcile`, {
  method: "POST",
  body: {},
});
assert.equal(mismatchReconcile.status, 409);
assert.equal(mismatchReconcile.json.error.code, "CAPTURE_AMOUNT_MISMATCH");
await setCaptureMode("success");
report("mismatch retained, blocked release and needs reconciliation", {
  capture: mismatch.json.error.code,
  retry: mismatchReplay.json.error.code,
  release: mismatchCancel.json.error.code,
  reconcile: mismatchReconcile.json.error.code,
});

const third = await createTransaction(owner, { mandateId, amount: "10.00" });
const thirdOrder = await owner.call("/api/payments/create-order", {
  method: "POST",
  body: { transactionId: third.transactionId },
});
assert.equal(thirdOrder.status, 200, thirdOrder.text);
await setCaptureMode("fail");
const failedCapture = await owner.call(`/api/payments/${third.transactionId}/capture`, {
  method: "POST",
  body: {},
});
assert.ok([422, 502].includes(failedCapture.status), failedCapture.text);
await setCaptureMode("success");
const recovered = await owner.call(`/api/payments/${third.transactionId}/capture`, {
  method: "POST",
  body: {},
});
assert.equal(recovered.status, 200, recovered.text);
assert.equal(recovered.json.data.status, "SETTLED");
report("ambiguous capture retained, retry recovered", {
  firstAttempt: failedCapture.json?.error?.code,
  retry: recovered.json.data.status,
});

const audit = await owner.call("/api/audit?pageSize=100");
assert.equal(audit.status, 200, audit.text);
assert.equal(audit.json.data.chain.valid, true, JSON.stringify(audit.json.data.chain));
assert.ok(audit.json.data.chain.checked >= 10, JSON.stringify(audit.json.data.chain));
report("audit chain after payment lifecycle", audit.json.data.chain);

const secondAccount = new Session();
const secondEmail = `mock.other.${Date.now()}@apex.test`;
const registration2 = await secondAccount.call("/api/auth/register", {
  method: "POST",
  body: {
    name: "Mock Other Owner",
    email: secondEmail,
    organization: "Other Organization",
    password: "mock-lifecycle-passphrase-2026",
  },
});
assert.equal(registration2.status, 201, registration2.text);
const crossCapture = await secondAccount.call(`/api/payments/${first.transactionId}/capture`, {
  method: "POST",
  body: {},
});
assert.equal(crossCapture.status, 404);
const crossOrder = await secondAccount.call("/api/payments/create-order", {
  method: "POST",
  body: { transactionId: first.transactionId },
});
assert.equal(crossOrder.status, 404);
report("cross-account payment access denied", [crossCapture.status, crossOrder.status]);

const unknown = new Session();
const unauthorized = await unknown.call("/api/payments/create-order", {
  method: "POST",
  body: { transactionId: first.transactionId },
});
assert.equal(unauthorized.status, 401);
report("unauthenticated payment request denied", unauthorized.status);

console.log(`\nMOCK PAYMENT LIFECYCLE: PASS (${BASE}; PayPal boundary mocked at ${MOCK})`);
