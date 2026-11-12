import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign,
} from "node:crypto";
import { ConfigurationError } from "../errors";
import { canonicalize, sha256Hex } from "./canonical";
import { verifySignature } from "./keys";

export interface AgentKeyPair {
  publicKeyBase64: string;
  encryptedPrivateKey: string;
  fingerprint: string;
}

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new ConfigurationError(
      "AUTH_SECRET is not configured. Set a strong random value to protect agent credentials.",
    );
  }
  return createHash("sha256").update(`pact.agent.credential.v1:${secret}`).digest();
}

export function createAgentKeyPair(): AgentKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateDer = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const publicDer = publicKey.export({ format: "der", type: "spki" }).toString("base64");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(privateDer, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString("base64");

  return {
    publicKeyBase64: publicDer,
    encryptedPrivateKey: payload,
    fingerprint: sha256Hex(publicDer).slice(0, 32),
  };
}

export function decryptAgentPrivateKey(ciphertext: string): string {
  try {
    const raw = Buffer.from(ciphertext, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    throw new ConfigurationError(
      "Agent credential could not be decrypted with the configured AUTH_SECRET.",
    );
  }
}

/** Signs a proposal with the agent's own Ed25519 identity key (server-side only). */
export function signAsAgent(encryptedPrivateKey: string, payload: unknown) {
  const privateKey = createPrivateKey({
    key: Buffer.from(decryptAgentPrivateKey(encryptedPrivateKey), "base64"),
    format: "der",
    type: "pkcs8",
  });
  const canonical = canonicalize(payload);
  return {
    signature: cryptoSign(null, Buffer.from(canonical, "utf8"), privateKey).toString("base64"),
    canonicalHash: sha256Hex(canonical),
  };
}

export function verifyAgentSignature(
  payload: unknown,
  signature: string,
  publicKeyBase64: string,
): boolean {
  return verifySignature(payload, signature, publicKeyBase64);
}

export function publicKeyFingerprint(publicKeyBase64: string): string {
  return sha256Hex(publicKeyBase64).slice(0, 32);
}

export function agentPublicKeyFromPrivate(privateKeyBase64: string): string {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  return createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64");
}
