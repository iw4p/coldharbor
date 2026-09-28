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
    name: cfg.model.split("/").at(-1)!.split(":")[0],
    async json(system, user) {
      const messages = [{ role: "system", content: system }, { role: "user", content: user }];
      const init = {
        method: "POST",
        headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify(ollama
          ? { model: cfg.model, messages, stream: false, think: false, format: "json", options: { temperature: 0 } }
          : { model: cfg.model, messages, temperature: 0, max_tokens: 512, response_format: { type: "json_object" } }),
      };
      // One retry on network failures (a model reloading can drop a connection) and on rate limits (hosted APIs).
      const wait = (s: number) => new Promise((r) => setTimeout(r, Math.min(20, s) * 1000));
      const send = () => fetch(url, init).catch(async () => (await wait(1), fetch(url, init)));
      let res = await send();
      for (let i = 0; res.status === 429 && i < 3; i++) res = (await wait(Number(res.headers.get("retry-after")) || 2), await send());
      // Groq's JSON mode now and then gives up on a generation; a second try usually works.
      if (res.status === 400 && (await res.clone().text()).includes("json_validate_failed")) res = await send();
      if (!res.ok) throw new Error(`${url} returned ${res.status}: ${await res.text()}`);
      const body = await res.json();
      return parseJson(ollama ? Ollama.parse(body).message.content : OpenAI.parse(body).choices[0].message.content);
    },
  };
}
