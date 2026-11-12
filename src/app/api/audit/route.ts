import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireApiAuth } from "@/lib/auth/guards";
import { fail, ok, withApi } from "@/lib/api/response";
import { db } from "@/lib/db";
import { verifyAuditChain } from "@/lib/audit";

export const runtime = "nodejs";

export const GET = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);
  const params = request.nextUrl.searchParams;
  const action = params.get("action") ?? "ALL";
  const search = params.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(10, Number(params.get("pageSize") ?? 50)));
  const eventId = params.get("eventId")?.trim();

  if (eventId) {
    const event = await db.auditEvent.findFirst({
      where: { ownerId: auth.userId, eventId },
    });
    if (!event) return fail("NOT_FOUND", "Audit event not found.", 404);
    return ok({ event, chain: await verifyAuditChain(auth.userId) });
  }

  const where: Prisma.AuditEventWhereInput = { ownerId: auth.userId };
  if (action !== "ALL") where.action = action;
  if (search) {
    where.OR = [
      { eventId: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
      { resourceId: { contains: search, mode: "insensitive" } },
      { actorLabel: { contains: search, mode: "insensitive" } },
    ];
  }

  const [events, total, actions, chain] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditEvent.count({ where }),
    db.auditEvent.groupBy({
      by: ["action"],
      where: { ownerId: auth.userId },
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
    }),
    verifyAuditChain(auth.userId),
  ]);

  return ok({
    events,
    total,
    page,
    pageSize,
    actions: actions.map((entry) => ({ action: entry.action, count: entry._count._all })),
    chain,
  });
});
