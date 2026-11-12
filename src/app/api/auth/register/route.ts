import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { registerSchema } from "@/lib/validation/schemas";
import { clientKey, enforceRateLimit, fail, ok, withApi } from "@/lib/api/response";
import { appendAuditEvent, AUDIT } from "@/lib/audit";

export const runtime = "nodejs";

export const POST = withApi(async (request) => {
  enforceRateLimit(clientKey(request, "register"), 8, 60_000);
  const payload = registerSchema.parse(await request.json());

  const existing = await db.user.findUnique({ where: { email: payload.email } });
  if (existing) {
    throw new AppError("EMAIL_TAKEN", "An account already exists for that email.", 409);
  }

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: payload.email,
        name: payload.name,
        organization: payload.organization || null,
        passwordHash: hashPassword(payload.password),
      },
    });
    await appendAuditEvent(tx, {
      ownerId: created.id,
      actorType: "USER",
      actorId: created.id,
      actorLabel: created.name,
      action: AUDIT.ACCOUNT_CREATED,
      resourceType: "USER",
      resourceId: created.id,
      summary: `Account created for ${created.email}.`,
      details: { organization: created.organization },
    });
    return created;
  });

  await createSession(user.id, { userAgent: request.headers.get("user-agent") ?? undefined });

  return ok({ user: { id: user.id, name: user.name, email: user.email } }, 201);
});

export function GET() {
  return fail("METHOD_NOT_ALLOWED", "Use POST to register.", 405);
}
