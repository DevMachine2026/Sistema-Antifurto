/** Cliente Gemini (API gratuita) — apenas Edge Functions. */

export interface GeminiJsonResult {
  raw: Record<string, unknown>;
  model: string;
}

export async function geminiGenerateJson(
  systemPrompt: string,
  userPayload: string,
): Promise<GeminiJsonResult | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) return null;

  const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-2.0-flash";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPayload }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error(JSON.stringify({ event: "gemini_http_error", status: res.status, detail: detail.slice(0, 500) }));
    return null;
  }

  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== "string") return null;

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return { raw: parsed, model };
  } catch {
    console.error(JSON.stringify({ event: "gemini_json_parse_failed", snippet: text.slice(0, 200) }));
    return null;
  }
}
