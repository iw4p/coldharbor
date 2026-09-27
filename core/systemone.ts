/**
 * System One: fast answers to the harness's quick questions (which tool? a map? a follow-up?).
 *
 * A question is a yes/no string, or a choice between options. Every answer is a probability per
 * option; a yes/no answer is { yes: p }. Kev and any chat model answer the same questions, so the
 * engine never knows which one it's talking to.
 */
import { z } from "zod";
import type { LLM } from "./types.ts";

export type Question = string | { ask: string; options: Record<string, string> };
export type Answers = Record<string, Record<string, number>>;

export interface SystemOne {
  name: string;
  /** `context` says what the user is looking at; a model that works from the message alone may ignore it. */
  decide(message: string, questions: Record<string, Question>, context?: string): Promise<Answers>;
}

export const yes = (a: Answers, key: string) => a[key]?.yes ?? 0;
const map = <A, B>(o: Record<string, A>, f: (a: A, key: string) => B) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v, k)]));

const KevAnswers = z.object({ answers: z.record(z.string(), z.object({ noul: z.number().optional(), probabilities: z.record(z.string(), z.number()).optional() })) });

/** Kev (https://github.com/jaredpalmer/kev): a small local decision model with calibrated probabilities, ~0.2 s a question. */
export function kev({ baseUrl, apiKey }: { baseUrl: string; apiKey?: string }): SystemOne {
  return {
    name: "Kev",
    async decide(message, questions) {
      const res = await fetch(`${baseUrl}/v1/systemone`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({
          state: message,
          model: "kev-latest",
          questions: map(questions, (q) => (typeof q === "string" ? { type: "noul", instructions: q } : { type: "choice", instructions: q.ask, criteria: q.options })),
        }),
      });
      if (!res.ok) throw new Error(`Kev returned ${res.status}: ${await res.text()}`);
      return map(KevAnswers.parse(await res.json()).answers, (a) => a.probabilities ?? { yes: a.noul ?? 0 });
    },
  };
}

/** Any chat model answering the same questions in one call. Its confidence is self-reported: yes/no becomes 0.9/0.1. */
export function llmDecider(llm: LLM): SystemOne {
  return {
    name: llm.name,
    async decide(message, questions, context) {
      const list = Object.entries(questions).map(([k, q]) => (typeof q === "string" ? `${k} (yes/no): ${q}`
        : `${k} (choice): ${q.ask}\n${Object.entries(q.options).map(([id, d]) => `  - ${id}: ${d}`).join("\n")}`));
      const out = z.record(z.string(), z.unknown()).parse(await llm.json(
        `Answer these questions about the user's message. Reply with one JSON object: for a yes/no question, its key with true or false; ` +
          `for a choice question, its key with the id of the best option, and "<key>_confidence" from 0 to 1.\n\n${list.join("\n")}` +
          (context ? `\n\nContext: ${context}. Short follow-ups ("and the issues?", "what about X?") usually mean the same place or thing.` : ""),
        message,
      ));
      return map(questions, (q, k) => {
        // Small models answer true or "true" (or "yes") about equally often.
        if (typeof q === "string") return { yes: /^(true|yes)$/i.test(String(out[k])) ? 0.9 : 0.1 };
        const ids = Object.keys(q.options), p = Math.max(0, Math.min(1, Number(out[`${k}_confidence`] ?? 0.8)));
        return Object.fromEntries(ids.map((id) => [id, id === String(out[k] ?? "none") ? p : (1 - p) / ids.length]));
      });
    },
  };
}
