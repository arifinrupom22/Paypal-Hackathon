import "server-only";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { AppError } from "../errors";
import { getAuthContext, verifyCsrfToken, type AuthContext } from "./session";

export async function requirePageAuth(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  return context;
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin) return;
  try {
    if (new URL(origin).host !== host) {
      throw new AppError("ORIGIN_REJECTED", "Cross-origin request rejected.", 403);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("ORIGIN_REJECTED", "Invalid request origin.", 403);
  }
}

export async function requireApiAuth(request: NextRequest): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    throw new AppError("UNAUTHENTICATED", "Authentication required.", 401);
  }

  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    assertSameOrigin(request);
    const header = request.headers.get("x-pact-csrf") ?? "";
    if (!verifyCsrfToken(context.sessionId, header)) {
      throw new AppError("CSRF_REJECTED", "Request verification failed. Reload and try again.", 403);
    }
  }

  return context;
}
