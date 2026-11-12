import { describe, expect, it } from "vitest";
import { canonicalize, sha256Hex } from "../../src/lib/crypto/canonical";
import { signPayload, verifySignature, platformKeys } from "../../src/lib/crypto/keys";
import { formatMoney, money } from "../../src/lib/money";

describe("canonical serialization", () => {
  it("sorts keys recursively and is stable across key order", () => {
    const a = { b: 2, a: { d: 4, c: 3 }, list: [{ z: 1, y: 2 }] };
    const b = { list: [{ y: 2, z: 1 }], a: { c: 3, d: 4 }, b: 2 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(canonicalize(a)).toBe('{"a":{"c":3,"d":4},"b":2,"list":[{"y":2,"z":1}]}');
  });

  it("produces a different hash when a signed value changes", () => {
    expect(sha256Hex(canonicalize({ amount: "10.00" }))).not.toBe(
      sha256Hex(canonicalize({ amount: "10.01" })),
    );
  });
});

describe("Ed25519 signing", () => {
  it("verifies a signed payload and rejects tampering", () => {
    const payload = { mandate_id: "mnd_1", constraints: { max_total: "50.00" } };
    const envelope = signPayload(payload);
    const { publicKeyBase64 } = platformKeys();

    expect(verifySignature(payload, envelope.signature, publicKeyBase64)).toBe(true);
    expect(
      verifySignature(
        { mandate_id: "mnd_1", constraints: { max_total: "5000.00" } },
        envelope.signature,
        publicKeyBase64,
      ),
    ).toBe(false);
  });
});

describe("financial decimal arithmetic", () => {
  it("keeps two-decimal precision without floating point drift", () => {
    expect(money("0.1").plus("0.2").toFixed(2)).toBe("0.30");
    expect(money("19.99").times(3).toFixed(2)).toBe("59.97");
    expect(formatMoney("1000.005")).toBe("1000.01");
    expect(money("50.00").minus("49.99").toFixed(2)).toBe("0.01");
  });
});
