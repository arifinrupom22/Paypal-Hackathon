import "server-only";
import { AppError, ConfigurationError } from "./errors";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  environment: "sandbox" | "live";
  webhookId: string | null;
}

export function getPayPalConfig(): PayPalConfig | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const environment = (process.env.PAYPAL_ENVIRONMENT ?? "sandbox").toLowerCase() === "live" ? "live" : "sandbox";
  let baseUrl =
    environment === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  // Explicit loopback-only test hook. It is disabled unless both variables
  // are set, and can never point production traffic at an arbitrary host.
  const mockUrl = process.env.PACT_PAYPAL_MOCK_URL?.trim();
  if (mockUrl && process.env.PACT_ALLOW_PAYPAL_MOCK === "1") {
    const parsed = new URL(mockUrl);
    if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
      throw new ConfigurationError("PACT_PAYPAL_MOCK_URL must be an http loopback URL.");
    }
    baseUrl = mockUrl.replace(/\/$/, "");
  }

  return {
    clientId,
    clientSecret,
    baseUrl,
    environment,
    webhookId: process.env.PAYPAL_WEBHOOK_ID?.trim() || null,
  };
}

export function requirePayPalConfig(): PayPalConfig {
  const config = getPayPalConfig();
  if (!config) {
    throw new ConfigurationError(
      "PayPal REST credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to process payments.",
      { required: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] },
    );
  }
  return config;
}

export function paypalStatus() {
  const config = getPayPalConfig();
  return {
    configured: Boolean(config),
    environment: config?.environment ?? null,
    baseUrl: config?.baseUrl ?? null,
    webhookConfigured: Boolean(config?.webhookId),
  };
}

const PROVIDER_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new AppError(
        "PAYPAL_TIMEOUT",
        "PayPal did not respond within 20 seconds. The payment remains unconfirmed.",
        504,
      );
    }
    throw new AppError(
      "PAYPAL_UNREACHABLE",
      "PayPal could not be reached. The payment remains unconfirmed.",
      502,
    );
  }
}

let cachedToken: { token: string; expiresAt: number; baseUrl: string } | null = null;

export async function getPayPalAccessToken(): Promise<string> {
  const config = requirePayPalConfig();
  if (cachedToken && cachedToken.baseUrl === config.baseUrl && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const response = await fetchWithTimeout(`${config.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new AppError(
      "PAYPAL_AUTH_FAILED",
      `PayPal authentication failed (HTTP ${response.status}). Verify the sandbox credentials.`,
      502,
    );
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new AppError("PAYPAL_AUTH_FAILED", "PayPal did not return an access token.", 502);
  }
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 300) * 1000,
    baseUrl: config.baseUrl,
  };
  return json.access_token;
}

async function paypalRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; requestId?: string },
): Promise<T> {
  const config = requirePayPalConfig();
  const token = await getPayPalAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;

  const response = await fetchWithTimeout(`${config.baseUrl}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  const text = await response.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      throw new AppError("PAYPAL_INVALID_RESPONSE", "PayPal returned an unreadable response.", 502);
    }
  }

  if (!response.ok) {
    const detail = json as { message?: string; debug_id?: string; details?: { issue?: string }[] };
    throw new AppError(
      "PAYPAL_API_ERROR",
      `PayPal rejected the request (HTTP ${response.status}): ${detail.message ?? "unknown error"}${
        detail.debug_id ? ` [debug_id ${detail.debug_id}]` : ""
      }`,
      response.status >= 500 ? 502 : 422,
      { paypalStatus: response.status, issues: detail.details?.map((entry) => entry.issue) ?? [] },
    );
  }

  return json as T;
}

interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

export interface PayPalOrder {
  id: string;
  status: string;
  links?: PayPalLink[];
}

export async function createPayPalOrder(input: {
  amount: string;
  currency: string;
  description: string;
  referenceId: string;
  customId: string;
  invoiceId: string;
  returnUrl: string;
  cancelUrl: string;
  requestId: string;
}): Promise<{ id: string; status: string; approveUrl: string | null }> {
  const order = await paypalRequest<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    requestId: input.requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.customId,
          invoice_id: input.invoiceId,
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: input.amount },
        },
      ],
      application_context: {
        brand_name: "PACT",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    },
  });

  const approveUrl =
    order.links?.find((link) => link.rel === "approve" || link.rel === "payer-action")?.href ?? null;

  return { id: order.id, status: order.status, approveUrl };
}

export interface PayPalCaptureResult {
  orderId: string;
  orderStatus: string;
  captureId: string | null;
  captureStatus: string | null;
  amount: string | null;
  currency: string | null;
  fee: string | null;
  raw: unknown;
}

interface CaptureResponse {
  id: string;
  status: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount?: { value?: string; currency_code?: string };
        seller_receivable_breakdown?: { paypal_fee?: { value?: string } };
      }>;
    };
  }>;
}

export interface PayPalOrderDetails {
  id: string;
  status: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount?: { value?: string; currency_code?: string };
        seller_receivable_breakdown?: { paypal_fee?: { value?: string } };
      }>;
    };
  }>;
}

export async function getPayPalOrder(orderId: string): Promise<PayPalOrderDetails> {
  return paypalRequest<PayPalOrderDetails>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
  });
}

export async function capturePayPalOrder(
  orderId: string,
  requestId: string,
): Promise<PayPalCaptureResult> {
  const response = await paypalRequest<CaptureResponse>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    { method: "POST", body: {}, requestId },
  );
  const capture = response.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    orderId: response.id,
    orderStatus: response.status,
    captureId: capture?.id ?? null,
    captureStatus: capture?.status ?? null,
    amount: capture?.amount?.value ?? null,
    currency: capture?.amount?.currency_code ?? null,
    fee: capture?.seller_receivable_breakdown?.paypal_fee?.value ?? null,
    raw: response,
  };
}

export async function verifyPayPalWebhookSignature(
  headers: Headers,
  event: unknown,
): Promise<{ verified: boolean; reason?: string }> {
  const config = requirePayPalConfig();
  if (!config.webhookId) {
    throw new ConfigurationError(
      "PAYPAL_WEBHOOK_ID is not configured, so webhook authenticity cannot be verified.",
      { required: ["PAYPAL_WEBHOOK_ID"] },
    );
  }

  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionTime = headers.get("paypal-transmission-time");
  const transmissionSig = headers.get("paypal-transmission-sig");
  const certUrl = headers.get("paypal-cert-url");
  const authAlgo = headers.get("paypal-auth-algo");

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return { verified: false, reason: "Missing PayPal transmission headers." };
  }

  const result = await paypalRequest<{ verification_status?: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: {
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: config.webhookId,
        webhook_event: event,
      },
    },
  );

  return result.verification_status === "SUCCESS"
    ? { verified: true }
    : { verified: false, reason: `PayPal returned ${result.verification_status ?? "UNKNOWN"}.` };
}
