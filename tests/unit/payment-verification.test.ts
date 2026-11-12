import { describe, expect, it } from "vitest";
import {
  canReleaseReservation,
  isDuplicateKeyError,
  verifyCapture,
} from "@/lib/payments/verification";

const expected = { amount: "40.00", currency: "USD" };

describe("PayPal capture verification", () => {
  it("settles only a completed capture with the exact amount and currency", () => {
    const result = verifyCapture(
      {
        orderStatus: "COMPLETED",
        captureStatus: "COMPLETED",
        captureId: "CAP-1",
        amount: "40.00",
        currency: "USD",
      },
      expected,
    );
    expect(result.settled).toBe(true);
    expect(result.amountMatches).toBe(true);
    expect(result.currencyMatches).toBe(true);
  });

  it("rejects a higher or lower capture amount", () => {
    const result = verifyCapture(
      {
        orderStatus: "COMPLETED",
        captureStatus: "COMPLETED",
        captureId: "CAP-1",
        amount: "40.01",
        currency: "USD",
      },
      expected,
    );
    expect(result.amountMatches).toBe(false);
    expect(result.settled).toBe(false);
  });

  it("rejects a currency substitution", () => {
    const result = verifyCapture(
      {
        orderStatus: "COMPLETED",
        captureStatus: "COMPLETED",
        captureId: "CAP-1",
        amount: "40.00",
        currency: "EUR",
      },
      expected,
    );
    expect(result.currencyMatches).toBe(false);
    expect(result.settled).toBe(false);
  });

  it("does not settle a pending capture or an order without a capture id", () => {
    expect(
      verifyCapture(
        {
          orderStatus: "COMPLETED",
          captureStatus: "PENDING",
          captureId: "CAP-1",
          amount: "40.00",
          currency: "USD",
        },
        expected,
      ).settled,
    ).toBe(false);
    expect(
      verifyCapture(
        {
          orderStatus: "COMPLETED",
          captureStatus: "COMPLETED",
          captureId: null,
          amount: "40.00",
          currency: "USD",
        },
        expected,
      ).settled,
    ).toBe(false);
  });

  it("fails closed for malformed provider amounts", () => {
    const result = verifyCapture(
      {
        orderStatus: "COMPLETED",
        captureStatus: "COMPLETED",
        captureId: "CAP-1",
        amount: "not-money",
        currency: "USD",
      },
      expected,
    );
    expect(result.amountMatches).toBe(false);
    expect(result.settled).toBe(false);
  });
});

describe("reservation release guard", () => {
  it("releases an unsubmitted policy-authorized transaction", () => {
    expect(canReleaseReservation("POLICY_APPROVED", null)).toBe(true);
  });

  it("refuses to release once PayPal has an order", () => {
    expect(canReleaseReservation("AWAITING_BUYER_APPROVAL", "ORDER-1")).toBe(false);
    expect(canReleaseReservation("POLICY_APPROVED", "ORDER-1")).toBe(false);
  });

  it("refuses to release settled, captured or failed transactions", () => {
    expect(canReleaseReservation("SETTLED", null)).toBe(false);
    expect(canReleaseReservation("CAPTURING", null)).toBe(false);
    expect(canReleaseReservation("FAILED", null)).toBe(false);
    expect(canReleaseReservation("CANCELLED", null)).toBe(false);
  });
});

describe("webhook uniqueness", () => {
  it("recognises Prisma unique-constraint errors", () => {
    expect(isDuplicateKeyError({ code: "P2002" })).toBe(true);
    expect(isDuplicateKeyError({ code: "P2025" })).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });
});
