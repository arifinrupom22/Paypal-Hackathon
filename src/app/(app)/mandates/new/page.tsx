import { requirePageAuth } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { MandateWizard } from "@/components/mandates/wizard";

export const dynamic = "force-dynamic";

export default async function NewMandatePage() {
  const auth = await requirePageAuth();
  const [agents, catalog] = await Promise.all([
    db.agent.findMany({
      where: { ownerId: auth.userId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, tier: true },
    }),
    db.catalogItem.findMany({ select: { merchant: true, category: true }, take: 200 }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <span className="pill border-line bg-surface-input text-ink-muted">Zero-trust authorizer</span>
        <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] text-ink">
          Mandate Creation Wizard
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-secondary">
          Compile autonomous execution parameters into a signed authorization policy. The model
          extracts intent; you review and confirm every permission before the server signs.
        </p>
      </div>

      <MandateWizard
        agents={agents}
        catalog={{
          merchants: Array.from(new Set(catalog.map((item) => item.merchant))),
          categories: Array.from(new Set(catalog.map((item) => item.category))),
        }}
        geminiConfigured={isGeminiConfigured()}
      />
    </div>
  );
}
