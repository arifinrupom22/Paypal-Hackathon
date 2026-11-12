import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { withApi } from "@/lib/api/response";
import { db } from "@/lib/db";
import { mandatePayloadOf } from "@/lib/services/mandates";
import { buildMandatePayload } from "@/lib/crypto/mandate-payload";

export const runtime = "nodejs";

/**
 * Exports the owner's mandates with the exact canonical payload that was
 * signed, so the Ed25519 proof can be re-verified outside PACT.
 */
export const GET = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);

  const mandates = await db.mandate.findMany({
    where: { ownerId: auth.userId },
    include: { scopes: true },
    orderBy: { createdAt: "desc" },
  });

  const body = {
    format: "pact.mandates.v1",
    exportedAt: new Date().toISOString(),
    ownerId: auth.userId,
    count: mandates.length,
    mandates: mandates.map((mandate) => ({
      mandateId: mandate.mandateId,
      status: mandate.status,
      revokedAt: mandate.revokedAt?.toISOString() ?? null,
      payload: buildMandatePayload(mandatePayloadOf(mandate)),
      canonicalHash: mandate.canonicalHash,
      signature: mandate.signature,
      signingKeyId: mandate.signingKeyId,
    })),
  };

  const filename = `pact-mandates-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
