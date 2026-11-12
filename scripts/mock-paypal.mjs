// Loopback-only PayPal contract mock for local payment state-machine tests.
// It never contacts PayPal and is not used by the application unless
// PACT_ALLOW_PAYPAL_MOCK=1 and PACT_PAYPAL_MOCK_URL point at this server.
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PAYPAL_PORT ?? 4100);
const orders = new Map();
let sequence = 0;
let captureMode = "success";

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function body(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (request.method === "POST" && url.pathname === "/__control") {
    const input = await body(request);
    captureMode = input.captureMode ?? "success";
    return json(response, 200, { captureMode });
  }
  if (request.method === "POST" && url.pathname === "/v1/oauth2/token") {
    return json(response, 200, { access_token: "mock-access-token", expires_in: 3600 });
  }
  if (request.method === "POST" && url.pathname === "/v2/checkout/orders") {
    const input = await body(request);
    sequence += 1;
    const id = `MOCK-ORDER-${Date.now()}-${sequence}`;
    const amount = input.purchase_units?.[0]?.amount ?? {};
    const order = {
      id,
      status: "CREATED",
      amount,
      description: input.purchase_units?.[0]?.description ?? "",
    };
    orders.set(id, order);
    return json(response, 201, {
      id,
      status: order.status,
      links: [{ href: `http://127.0.0.1:${PORT}/approve/${id}`, rel: "approve", method: "GET" }],
    });
  }
  const orderMatch = /^\/v2\/checkout\/orders\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && orderMatch) {
    const id = decodeURIComponent(orderMatch[1]);
    const order = orders.get(id);
    if (!order) return json(response, 404, { message: "Order not found" });
    if (order.status === "COMPLETED") {
      return json(response, 200, {
        id,
        status: "COMPLETED",
        purchase_units: [
          {
            payments: {
              captures: [
                {
                  id: order.captureId,
                  status: "COMPLETED",
                  amount: order.captureAmount ?? order.amount,
                  seller_receivable_breakdown: { paypal_fee: { value: "0.50" } },
                },
              ],
            },
          },
        ],
      });
    }
    return json(response, 200, { id, status: order.status, purchase_units: [] });
  }
  const captureMatch = /^\/v2\/checkout\/orders\/([^/]+)\/capture$/.exec(url.pathname);
  if (request.method === "POST" && captureMatch) {
    const id = decodeURIComponent(captureMatch[1]);
    const order = orders.get(id);
    if (!order) return json(response, 404, { message: "Order not found" });
    if (order.status === "COMPLETED") {
      return json(response, 422, { message: "ORDER_ALREADY_CAPTURED", debug_id: "MOCK" });
    }
    if (captureMode === "fail") {
      return json(response, 422, { message: "CAPTURE_FAILED", debug_id: "MOCK" });
    }
    const captureAmount =
      captureMode === "mismatch"
        ? { ...order.amount, value: (Number(order.amount.value) - 0.01).toFixed(2) }
        : order.amount;
    order.status = "COMPLETED";
    order.captureId = `MOCK-CAPTURE-${id}`;
    order.captureAmount = captureAmount;
    return json(response, 201, {
      id,
      status: "COMPLETED",
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: order.captureId,
                status: "COMPLETED",
                amount: captureAmount,
                seller_receivable_breakdown: { paypal_fee: { value: "0.50" } },
              },
            ],
          },
        },
      ],
    });
  }
  if (request.method === "POST" && url.pathname === "/v1/notifications/verify-webhook-signature") {
    const input = await body(request);
    return json(response, 200, {
      verification_status: input.transmission_sig === "valid" ? "SUCCESS" : "FAILURE",
    });
  }
  return json(response, 404, { message: "Unknown mock endpoint" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock-paypal listening on http://127.0.0.1:${PORT}`);
});
