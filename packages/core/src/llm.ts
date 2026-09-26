import type { LLM } from "./types.ts";

export interface LLMConfig {
  /** "ollama" uses Ollama's native API; "openai" works with OpenAI and any compatible server (LM Studio, vLLM, llama.cpp, OpenRouter…). */
  provider: "ollama" | "openai";
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`The model did not return JSON: ${t.slice(0, 200)}`);
  }
}

export function createLLM(cfg: LLMConfig): LLM {
  const name = cfg.model.split(":")[0];
  if (cfg.provider === "ollama") {
    const base = cfg.baseUrl ?? "http://127.0.0.1:11434";
    return {
      name,
      async json(system, user) {
        const res = await fetch(`${base}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: cfg.model, stream: false, think: false, format: "json", options: { temperature: 0 },
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
          }),
        });
        if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
        return parseJson((await res.json()).message.content);
      },
    };
  }
  const base = cfg.baseUrl ?? "https://api.openai.com/v1";
  return {
    name,
    async json(system, user) {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({
          model: cfg.model, temperature: 0, response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      if (!res.ok) throw new Error(`${base} returned ${res.status}: ${await res.text()}`);
      return parseJson((await res.json()).choices[0].message.content);
    },
  };
}
