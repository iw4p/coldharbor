import { z } from "zod";
import type { Config } from "./config.ts";
import type { LLM } from "./types.ts";

const Ollama = z.object({ message: z.object({ content: z.string() }) });
const OpenAI = z.object({ choices: z.tuple([z.object({ message: z.object({ content: z.string() }) })], z.unknown()) });

/** Models wrap JSON in prose or code fences now and then. */
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

/** "ollama" uses Ollama's native API; "openai" works with OpenAI and any compatible server. */
export function createLLM(cfg: Config["llm"]): LLM {
  const ollama = cfg.provider === "ollama";
  const url = ollama ? `${cfg.baseUrl ?? "http://127.0.0.1:11434"}/api/chat` : `${cfg.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`;
  return {
    name: cfg.model.split(":")[0],
    async json(system, user) {
      const messages = [{ role: "system", content: system }, { role: "user", content: user }];
      const init = {
        method: "POST",
        headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify(ollama
          ? { model: cfg.model, messages, stream: false, think: false, format: "json", options: { temperature: 0 } }
          : { model: cfg.model, messages, temperature: 0, response_format: { type: "json_object" } }),
      };
      // One retry on network failures: a model reloading under memory pressure can drop a connection.
      const res = await fetch(url, init).catch(async () => (await new Promise((r) => setTimeout(r, 1000)), fetch(url, init)));
      if (!res.ok) throw new Error(`${url} returned ${res.status}: ${await res.text()}`);
      const body = await res.json();
      return parseJson(ollama ? Ollama.parse(body).message.content : OpenAI.parse(body).choices[0].message.content);
    },
  };
}
