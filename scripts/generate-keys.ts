import { generateKeyPairSync, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateDer = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const publicDer = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const authSecret = randomBytes(48).toString("base64");

console.log("PACT_PRIVATE_KEY=" + privateDer);
console.log("PACT_PUBLIC_KEY=" + publicDer);
console.log("AUTH_SECRET=" + authSecret);

if (process.argv.includes("--write")) {
  const path = ".env.local";
  const block = [
    "",
    "# Generated Ed25519 platform signing keys (never commit this file)",
    `PACT_PRIVATE_KEY=${privateDer}`,
    `PACT_PUBLIC_KEY=${publicDer}`,
    `AUTH_SECRET=${authSecret}`,
    "",
  ].join("\n");
  if (!existsSync(path)) {
    writeFileSync(path, "DATABASE_URL=\nPACT_PRIVATE_KEY=\nPACT_PUBLIC_KEY=\nAUTH_SECRET=\n");
  }
  appendFileSync(path, block);
  console.log(`\nAppended signing keys to ${path}`);
}
