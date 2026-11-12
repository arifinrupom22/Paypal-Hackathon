import { generateKeyPairSync, randomBytes } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
process.env.PACT_PRIVATE_KEY = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
process.env.PACT_PUBLIC_KEY = publicKey.export({ format: "der", type: "spki" }).toString("base64");
process.env.AUTH_SECRET = randomBytes(48).toString("base64");
