export function getGeminiStatus() {
  const configured = Boolean(process.env.GEMINI_API_KEY?.trim());
  return {
    configured,
    model: configured ? "gemini-3.5-flash" : "local deterministic parser",
  };
}
