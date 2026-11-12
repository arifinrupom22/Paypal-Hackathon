import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { ok, withApi } from "@/lib/api/response";
import {
  getCategoryDistribution,
  getDailyDecisionSeries,
  getMetrics,
  getAuthorizationStream,
} from "@/lib/services/analytics";

export const runtime = "nodejs";

export const GET = withApi(async (request: NextRequest) => {
  const auth = await requireApiAuth(request);
  const [metrics, stream, categories, daily] = await Promise.all([
    getMetrics(auth.userId),
    getAuthorizationStream(auth.userId),
    getCategoryDistribution(auth.userId),
    getDailyDecisionSeries(auth.userId),
  ]);
  return ok({ metrics, stream, categories, daily });
});
