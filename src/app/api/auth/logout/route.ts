import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth/guards";
import { destroyCurrentSession } from "@/lib/auth/session";
import { appendAuditEvent, AUDIT } from "@/lib/audit";
import { ok, withApi } from "@/lib/api/response";

export const runtime = "nodejs";

export const POST = withApi(async (request) => {
  const auth = await requireApiAuth(request);
  await db.$transaction(async (tx) => {
    await appendAuditEvent(tx, {
      ownerId: auth.userId,
      actorType: "USER",
      actorId: auth.userId,
      actorLabel: auth.user.name,
      action: AUDIT.SESSION_ENDED,
      resourceType: "SESSION",
      resourceId: auth.sessionId,
      summary: "Session closed.",
      details: {},
    });
  });
  await destroyCurrentSession();
  return ok({ signedOut: true });
});
