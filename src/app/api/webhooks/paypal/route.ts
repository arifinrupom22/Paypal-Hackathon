import { NextResponse } from "next/server";
import { processPayPalWebhook } from "@/lib/services/webhooks";
import { fail } from "@/lib/api/response";
import { isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (rawBody.length > 512_000) {
    return fail("WEBHOOK_TOO_LARGE", "Webhook payload exceeds the accepted size.", 413);
  }
  try {
    const result = await processPayPalWebhook(new Headers(request.headers), rawBody);
    if (result.status === "rejected") {
      return fail("WEBHOOK_REJECTED", "Webhook signature verification failed.", 400);
    }
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (isAppError(error)) {
      return fail(error.code, error.message, error.status, error.details);
    }
    console.error("[pact:webhook]", error);
    return fail("WEBHOOK_ERROR", "Webhook processing failed.", 500);
  }
}
