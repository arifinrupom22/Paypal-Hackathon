// Configuration check. Prints presence and validity flags only — never values.
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";

function parseEnv(path) {
  const result = {};
  let source = "";
  try {
    source = readFileSync(path, "utf8");
  } catch {
    return result;
  }
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
const present = (name) => Boolean(env[name] && env[name].trim());

console.log("PRESENCE (values hidden)");
for (const name of [
  "DATABASE_URL",
  "AUTH_SECRET",
  "GEMINI_API_KEY",
  "PACT_PRIVATE_KEY",
  "PACT_PUBLIC_KEY",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
]) {
  console.log(`  ${name.padEnd(22)} ${present(name) ? "set" : "MISSING"}`);
}
console.log(`  APP_URL                ${env.APP_URL || "(default http://localhost:3000)"}`);
console.log(`  PAYPAL_ENVIRONMENT     ${env.PAYPAL_ENVIRONMENT || "(unset)"}`);

// Ed25519 key pair consistency and signing round-trip.
let keyStatus = "not checked";
let keyFingerprint = null;
if (present("PACT_PRIVATE_KEY") && present("PACT_PUBLIC_KEY")) {
  try {
    const privateKey = createPrivateKey({
      key: Buffer.from(env.PACT_PRIVATE_KEY, "base64"),
      format: "der",
      type: "pkcs8",
    });
    const configuredPublic = createPublicKey({
      key: Buffer.from(env.PACT_PUBLIC_KEY, "base64"),
      format: "der",
      type: "spki",
    });
    const derivedPublicDer = createPublicKey(privateKey).export({ format: "der", type: "spki" });
    const configuredPublicDer = configuredPublic.export({ format: "der", type: "spki" });
    const sameKey = Buffer.compare(derivedPublicDer, configuredPublicDer) === 0;
    const message = Buffer.from("pact-config-verification");
    const signature = sign(null, message, privateKey);
    const valid = verify(null, message, configuredPublic, signature);
    keyFingerprint = derivedPublicDer.toString("base64").slice(-12);
    keyStatus = `pair matches: ${sameKey}, sign/verify: ${valid}, type: ${privateKey.asymmetricKeyType}`;
    if (!sameKey || !valid || privateKey.asymmetricKeyType !== "ed25519") {
      keyStatus += " — INVALID CONFIGURATION";
    }
  } catch (error) {
    keyStatus = `INVALID: ${error.message}`;
  }
}
console.log(`\nPACT signing keys: ${keyStatus}`);
if (keyFingerprint) console.log(`  public key suffix: …${keyFingerprint}`);

// Gemini: list models and check access to the configured model with a tiny prompt.
if (present("GEMINI_API_KEY")) {
  const key = env.GEMINI_API_KEY.trim();
  try {
    const list = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    );
    const listBody = await list.json();
    const models = Array.isArray(listBody.models) ? listBody.models.map((m) => m.name) : [];
    console.log(`\nGemini key: HTTP ${list.status}`);
    console.log(`  gemini-3.5-flash available: ${models.some((m) => m.endsWith("gemini-3.5-flash"))}`);
    if (!list.ok) {
      console.log(`  error: ${listBody.error?.status ?? "unknown"} — ${listBody.error?.message ?? ""}`);
    } else {
      const generate = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Reply with the single word READY." }] }],
            generationConfig: { maxOutputTokens: 128, temperature: 0 },
          }),
        },
      );
      const body = await generate.json();
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
      console.log(`  generateContent: HTTP ${generate.status}, reply: ${JSON.stringify(text.trim().slice(0, 40))}`);
      if (!generate.ok) {
        console.log(`  error: ${body.error?.status ?? "unknown"} — ${body.error?.message ?? ""}`);
      }
    }
  } catch (error) {
    console.log(`\nGemini check failed: ${error.message}`);
  }
} else {
  console.log("\nGemini key: MISSING (deterministic fallback will be used)");
}

if (!present("PAYPAL_CLIENT_ID") || !present("PAYPAL_CLIENT_SECRET")) {
  console.log("\nPayPal: client ID/secret missing — order creation stays disabled (503).");
} else if (!present("PAYPAL_WEBHOOK_ID")) {
  console.log(
    "\nPayPal: credentials present, but PAYPAL_WEBHOOK_ID is missing — webhook verification stays disabled (400).",
  );
} else {
  console.log("\nPayPal: credentials and webhook id present — live sandbox lifecycle can be exercised.");
}
