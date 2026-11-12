import { requireApiAuth } from "@/lib/auth/guards";
import { revokeAllSessions } from "@/lib/auth/session";
import { db } from "@/lib/db";
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
      resourceId: null,
      summary: "All sessions revoked by owner.",
      details: { scope: "all_sessions" },
    });
  });
  await revokeAllSessions(auth.userId);
  return ok({ revoked: true });
});
