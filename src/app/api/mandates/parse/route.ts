import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { clientKey, enforceRateLimit, ok, withApi } from "@/lib/api/response";
import { parseIntentSchema } from "@/lib/validation/schemas";
import { parseMandateIntent } from "@/lib/ai/intent";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export const POST = withApi(async (request: NextRequest) => {
  await requireApiAuth(request);
  enforceRateLimit(clientKey(request, "mandate-parse"), 15, 60_000);
  const payload = parseIntentSchema.parse(await request.json());

  const result = await parseMandateIntent(payload.instruction);
  const catalog = await db.catalogItem.findMany({
    select: { merchant: true, category: true },
    take: 200,
  });

  return ok({
    draft: result.draft,
    parser: result.parser,
    catalog: {
      merchants: Array.from(new Set(catalog.map((item) => item.merchant))),
      categories: Array.from(new Set(catalog.map((item) => item.category))),
    },
    requiresConfirmation: true,
  });
});
