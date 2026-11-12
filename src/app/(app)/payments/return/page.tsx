import { PaymentReturn } from "@/components/payments/payment-return";

export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ transaction?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <span className="label-mono">PayPal buyer approval</span>
        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">Confirming settlement</h1>
        <p className="mt-1 text-[12px] leading-5 text-ink-secondary">
          Buyer approval is complete. PACT now captures the order server-side and verifies the
          result before any payment is recorded.
        </p>
      </div>
      <PaymentReturn transactionId={params.transaction ?? null} />
    </div>
  );
}
