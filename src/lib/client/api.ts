"use client";

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)pact_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? (init.json ? "POST" : "GET")).toUpperCase();

  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("x-pact-csrf", csrfToken());

  const response = await fetch(path, {
    ...init,
    method,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    credentials: "same-origin",
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const envelope = payload as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string; details?: unknown } }
    | null;

  if (!response.ok || !envelope || envelope.ok === false) {
    const error = envelope && envelope.ok === false ? envelope.error : null;
    throw new ApiClientError(
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      error?.details,
    );
  }

  return envelope.data;
}
