import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AppError, isAppError } from "../errors";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
): NextResponse<ApiFailure> {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

type Handler<C> = (request: NextRequest, context: C) => Promise<NextResponse> | NextResponse;

export function withApi<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (isAppError(error)) {
        return fail(error.code, error.message, error.status, error.details);
      }
      if (error instanceof ZodError) {
        return fail("VALIDATION_FAILED", "The request payload failed validation.", 422, {
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }
      console.error("[pact:api]", error);
      return fail("INTERNAL_ERROR", "An unexpected error occurred.", 500);
    }
  };
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    throw new AppError("RATE_LIMITED", `Too many requests. Retry in ${retryAfter}s.`, 429, {
      retryAfter,
    });
  }
}

export function clientKey(request: NextRequest, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  return `${scope}:${ip}`;
}
