import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/schemas";
import { clientKey, enforceRateLimit, ok, withApi } from "@/lib/api/response";
import { appendAuditEvent, AUDIT } from "@/lib/audit";

export const runtime = "nodejs";

export const POST = withApi(async (request) => {
  enforceRateLimit(clientKey(request, "login"), 10, 60_000);
  const payload = loginSchema.parse(await request.json());

  const user = await db.user.findUnique({ where: { email: payload.email } });
  if (!user || !verifyPassword(payload.password, user.passwordHash)) {
    // Deliberately identical response for unknown accounts and wrong passwords.
    throw new AppError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
  }

  const session = await createSession(user.id, {
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  await db.$transaction(async (tx) => {
    await appendAuditEvent(tx, {
      ownerId: user.id,
      actorType: "USER",
      actorId: user.id,
      actorLabel: user.name,
      action: AUDIT.SESSION_STARTED,
      resourceType: "SESSION",
      resourceId: session.sessionId,
      summary: `Session opened for ${user.email}.`,
      details: { user_agent: request.headers.get("user-agent")?.slice(0, 120) ?? null },
    });
  });

  return ok({ user: { id: user.id, name: user.name, email: user.email } });
});
