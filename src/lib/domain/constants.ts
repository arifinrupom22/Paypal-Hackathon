import type { TransactionStatus } from "@prisma/client";

/**
 * Statuses that hold a reservation against a mandate budget. A transaction
 * moves out of this set when it fails or is cancelled, which releases the
 * reserved amount back to the mandate.
 */
export const ACTIVE_TRANSACTION_STATUSES: TransactionStatus[] = [
  "POLICY_APPROVED",
  "AWAITING_BUYER_APPROVAL",
  "CAPTURING",
  "SETTLED",
];

export const SETTLED_TRANSACTION_STATUSES: TransactionStatus[] = ["SETTLED"];

export const PAYPAL_STATUS_LABELS: Record<string, string> = {
  POLICY_APPROVED: "Not submitted",
  AWAITING_BUYER_APPROVAL: "Awaiting buyer",
  CAPTURING: "Capturing",
  SETTLED: "Captured",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};
