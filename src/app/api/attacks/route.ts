import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { ok, withApi } from "@/lib/api/response";
import { listAttackRuns, SCENARIOS } from "@/lib/services/attacks";

export const runtime = "nodejs";

export const GET = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);
  const runs = await listAttackRuns(auth.userId, 50);
  return ok({
    scenarios: Object.entries(SCENARIOS).map(([id, meta]) => ({ id, ...meta })),
    runs,
  });
});
