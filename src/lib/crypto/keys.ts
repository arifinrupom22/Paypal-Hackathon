import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";
import { canonicalize, sha256Hex } from "./canonical";
import { ConfigurationError } from "../errors";

export interface PlatformKeys {
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyBase64: string;
  keyId: string;
  fingerprint: string;
}

export interface SignatureEnvelope {
  signature: string;
  canonicalHash: string;
  keyId: string;
}

const ENV_HELP =
  "Ed25519 signing keys are not configured. Run `npm run keys:generate` and set PACT_PRIVATE_KEY and PACT_PUBLIC_KEY.";

let cached: PlatformKeys | null = null;

export function platformKeys(): PlatformKeys {
  if (cached) return cached;

  const privateBase64 = process.env.PACT_PRIVATE_KEY?.trim();
  const publicBase64 = process.env.PACT_PUBLIC_KEY?.trim();
  if (!privateBase64 || !publicBase64) {
    throw new ConfigurationError(ENV_HELP, {
      missing: [
        !privateBase64 ? "PACT_PRIVATE_KEY" : null,
        !publicBase64 ? "PACT_PUBLIC_KEY" : null,
      ].filter(Boolean),
    });
  }

  let privateKey: KeyObject;
  let publicKey: KeyObject;
  try {
    privateKey = createPrivateKey({
      key: Buffer.from(privateBase64, "base64"),
      format: "der",
      type: "pkcs8",
    });
    publicKey = createPublicKey({
      key: Buffer.from(publicBase64, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    throw new ConfigurationError(`${ENV_HELP} The configured values are not valid Ed25519 DER keys.`);
  }

  if (privateKey.asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519") {
    throw new ConfigurationError("PACT signing keys must be Ed25519 (RFC 8032) key pairs.");
  }

  const derivedPublic = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  const configuredPublic = publicKey.export({ format: "der", type: "spki" });
  if (!derivedPublic.equals(configuredPublic)) {
    throw new ConfigurationError("PACT_PUBLIC_KEY does not match PACT_PRIVATE_KEY.");
  }

  const fingerprint = sha256Hex(configuredPublic.toString("hex"));
  cached = {
    privateKey,
    publicKey,
    publicKeyBase64: publicBase64,
    fingerprint,
    keyId: `ed25519:${fingerprint.slice(0, 16)}`,
  };
  return cached;
}

export function signPayload(payload: unknown): SignatureEnvelope {
  const { privateKey, keyId } = platformKeys();
  const canonical = canonicalize(payload);
  return {
    signature: cryptoSign(null, Buffer.from(canonical, "utf8"), privateKey).toString("base64"),
    canonicalHash: sha256Hex(canonical),
    keyId,
  };
}

export function verifySignature(
  payload: unknown,
  signature: string,
  publicKeyBase64: string,
): boolean {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyBase64, "base64"),
      format: "der",
      type: "spki",
    });
    return cryptoVerify(
      null,
      Buffer.from(canonicalize(payload), "utf8"),
      publicKey,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

export function platformFingerprint(): string {
  return platformKeys().fingerprint;
}

export function exportPublicKeyFromPrivate(privateKeyBase64: string): string {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  return createPublicKey(privateKey)
    .export({ format: "der", type: "spki" })
    .toString("base64");
}
