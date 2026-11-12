import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const GEMINI_MODEL = "gemini-3.5-flash";

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiModel() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  // The provider defaults to GOOGLE_GENERATIVE_AI_API_KEY; PACT standardizes on
  // GEMINI_API_KEY, so the key is passed explicitly instead of relying on the default.
  return createGoogleGenerativeAI({ apiKey })(GEMINI_MODEL);
}

export function geminiStatus() {
  return {
    configured: isGeminiConfigured(),
    model: isGeminiConfigured() ? GEMINI_MODEL : null,
    fallback: "PACT deterministic parser",
  };
}
