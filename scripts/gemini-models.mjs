// Lists Gemini models available to the configured key and probes text generation.
// Prints model names and status codes only — never the key.
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
const key = (env.GEMINI_API_KEY ?? "").trim();
if (!key) {
  console.log("GEMINI_API_KEY is empty.");
  process.exit(0);
}

const list = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
);
const body = await list.json();
const names = (body.models ?? [])
  .map((model) => String(model.name).replace("models/", ""))
  .filter((name) => /gemini/.test(name))
  .sort();
console.log(`ListModels HTTP ${list.status} — ${names.length} Gemini models`);
for (const name of names) console.log(`  ${name}`);

const preferred = process.argv.slice(2);
for (const name of preferred.length > 0 ? preferred : names.filter((n) => /flash/.test(n)).slice(0, 4)) {
  const started = Date.now();
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Reply with the single word READY." }] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0 },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text).join("") ?? "";
    console.log(
      `\n${name}: HTTP ${response.status} in ${Date.now() - started}ms ${JSON.stringify(text.trim().slice(0, 40))}`,
    );
    if (!response.ok) console.log(`  ${result.error?.status}: ${result.error?.message}`);
  } catch (error) {
    console.log(`\n${name}: request failed after ${Date.now() - started}ms — ${error.message}`);
  }
}
