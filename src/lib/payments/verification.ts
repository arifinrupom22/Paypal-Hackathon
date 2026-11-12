import { money } from "../money";

export interface CaptureEvidence {
  orderStatus: string;
  captureStatus: string | null;
  captureId: string | null;
  amount: string | null;
  currency: string | null;
}

export interface ExpectedPayment {
  amount: string;
  currency: string;
}

export interface CaptureVerification {
  orderCompleted: boolean;
  captureCompleted: boolean;
  captureIdPresent: boolean;
  amountMatches: boolean;
  currencyMatches: boolean;
  settled: boolean;
}

/** Pure verification used by both the capture endpoint and webhook processor. */
export function verifyCapture(
  evidence: CaptureEvidence,
  expected: ExpectedPayment,
): CaptureVerification {
  const orderCompleted = evidence.orderStatus === "COMPLETED";
  const captureCompleted = evidence.captureStatus === "COMPLETED";
  const captureIdPresent = Boolean(evidence.captureId);
  let amountMatches = false;
  try {
    amountMatches =
      evidence.amount !== null &&
      Boolean(evidence.amount) &&
      money(evidence.amount).equals(money(expected.amount));
  } catch {
    amountMatches = false;
  }
  const currencyMatches =
    evidence.currency?.trim().toUpperCase() === expected.currency.trim().toUpperCase();
  return {
    orderCompleted,
    captureCompleted,
    captureIdPresent,
    amountMatches,
    currencyMatches,
    settled: orderCompleted && captureCompleted && captureIdPresent && amountMatches && currencyMatches,
  };
}

/**
 * A PACT transaction created before PayPal checkout can be released locally.
 * Once a PayPal order exists, local cancellation would race buyer approval and
 * could release budget while PayPal still allows a capture. Such orders must be
 * reconciled with PayPal instead.
 */
export function canReleaseReservation(status: string, paypalOrderId: string | null): boolean {
  return (
    !paypalOrderId &&
    (status === "POLICY_APPROVED" || status === "AWAITING_BUYER_APPROVAL")
  );
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
