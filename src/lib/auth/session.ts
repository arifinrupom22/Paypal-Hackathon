import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "../db";

export const SESSION_COOKIE = "pact_session";
export const CSRF_COOKIE = "pact_csrf";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export interface AuthContext {
  userId: string;
  sessionId: string;
  csrfToken: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
    organization: string | null;
  };
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is not configured. Set a strong random value in .env.local.");
  }
  return secret;
}

export function csrfTokenFor(sessionId: string): string {
  return createHmac("sha256", authSecret()).update(`pact.csrf.v1:${sessionId}`).digest("hex");
}

export function verifyCsrfToken(sessionId: string, token: string): boolean {
  const expected = Buffer.from(csrfTokenFor(sessionId), "utf8");
  const provided = Buffer.from(token ?? "", "utf8");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export async function createSession(userId: string, meta: { userAgent?: string } = {}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHmac("sha256", authSecret()).update(token).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const session = await db.session.create({
    data: { userId, tokenHash, expiresAt, userAgent: meta.userAgent?.slice(0, 255) },
  });

  const jar = await cookies();
  const appUrl = process.env.APP_URL ?? "";
  const secure = appUrl.startsWith("https://") || (process.env.NODE_ENV === "production" && !appUrl);
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  jar.set(CSRF_COOKIE, csrfTokenFor(session.id), {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return { sessionId: session.id, csrfToken: csrfTokenFor(session.id) };
}

export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = createHmac("sha256", authSecret()).update(token).digest("hex");
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, name: true, organization: true } } },
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;

  return {
    userId: session.userId,
    sessionId: session.id,
    csrfToken: csrfTokenFor(session.id),
    expiresAt: session.expiresAt,
    user: session.user,
  };
});

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = createHmac("sha256", authSecret()).update(token).digest("hex");
    await db.session.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}

export async function revokeAllSessions(userId: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}
