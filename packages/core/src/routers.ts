import type { LLM, RouteDecision, Router, ToolInfo, WidgetSpec } from "./types.ts";

const SUBJECT = "Does the message name a specific place, company, coin, currency, topic, person or time period?";
const FOLLOW_UP = "Does the message ask to change or adjust the previous result, for example a different time range, place or item?";
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/**
 * Kev (https://github.com/jaredpalmer/kev): a small local decision model that answers
 * multiple-choice and yes/no questions with calibrated probabilities in ~0.2 s.
 * All questions go in one request; the model reads the message once.
 */
export function kevRouter(opts: { baseUrl: string; apiKey?: string }): Router {
  return {
    name: "Kev",
    async route(message: string, tools: ToolInfo[], widgets: WidgetSpec[]): Promise<RouteDecision> {
      const questions: Record<string, unknown> = {
        tool: {
          type: "choice",
          instructions: "Which data source is this message asking for?",
          criteria: {
            ...Object.fromEntries(tools.map((t) => [t.id, clip(`${t.title}: ${t.description}`, 240)])),
            none: "the message does not ask for any of these",
          },
        },
        subject: { type: "noul", instructions: SUBJECT },
        followup: { type: "noul", instructions: FOLLOW_UP },
        // One yes/no question per widget is much sharper than one multiple-choice question.
        ...Object.fromEntries(widgets.map((w) => [`widget:${w.id}`, { type: "noul", instructions: w.ask }])),
      };
      const t0 = Date.now();
      const res = await fetch(`${opts.baseUrl}/v1/systemone`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
        body: JSON.stringify({ state: message, model: "kev-latest", questions }),
      });
      if (!res.ok) throw new Error(`Kev returned ${res.status}: ${await res.text()}`);
      const a = (await res.json()).answers;
      const probs: Record<string, number> = a.tool.probabilities;
      return {
        by: "Kev",
        ms: Date.now() - t0,
        tools: Object.entries(probs).filter(([id]) => id !== "none").map(([id, p]) => ({ id, p })).sort((x, y) => y.p - x.p),
        none: probs.none ?? 0,
        widgets: Object.fromEntries(widgets.map((w) => [w.id, a[`widget:${w.id}`].noul])),
        newSubject: a.subject.noul,
        followUp: a.followup.noul,
      };
    },
  };
}

/**
 * Kev first; the LLM only when Kev is unsure which tool a message names.
 *
 * Kev answers in ~1 s and its probabilities are calibrated, so "unsure" is a reliable signal.
 * Escalating only those messages keeps most of Kev's speed and recovers the LLM's accuracy on
 * harder phrasings. Widget requests always come from Kev: the LLM tends to invent them.
 */
export function hybridRouter(kev: Router, llm: Router, opts = { toolThreshold: 0.55, viewOnly: 0.75, subject: 0.5 }): Router {
  return {
    name: "Kev + LLM",
    async route(message, tools, widgets) {
      const k = await kev.route(message, tools, widgets);
      const sure = (k.tools[0]?.p ?? 0) >= opts.toolThreshold;
      const viewOnly = Math.max(0, ...Object.values(k.widgets)) >= opts.viewOnly && k.newSubject < opts.subject;
      // Nothing to escalate: Kev is sure, it's a pure view change, or nothing new is named (off-topic or a vague follow-up).
      if (sure || viewOnly || k.newSubject < opts.subject) return k;
      const l = await llm.route(message, tools, widgets);
      return { ...l, widgets: k.widgets, newSubject: k.newSubject, followUp: k.followUp, by: `Kev → ${l.by}`, ms: k.ms + l.ms };
    },
  };
}

/** Routing with any chat model, for setups without Kev. Slower, and its confidence is self-reported. */
export function llmRouter(llm: LLM): Router {
  return {
    name: `${llm.name} router`,
    async route(message, tools, widgets) {
      const t0 = Date.now();
      const out = (await llm.json(
        `You route a user's message to one data tool and optionally a display widget. Reply with JSON only:\n` +
          `{"tool": "<tool id or null>", "confidence": 0-1, "widget": "<widget id the user explicitly asked for, or null>", "new_subject": true|false, "adjusts_previous": true|false}\n` +
          `Tools:\n${tools.map((t) => `- ${t.id}: ${t.title}. ${t.description}`).join("\n")}\n` +
          `Widgets:\n${widgets.map((w) => `- ${w.id}: ${w.name}`).join("\n")}\n` +
          `new_subject is true when the message names a place, company, coin, currency, topic, person or time period. ` +
          `adjusts_previous is true when the message changes a previous result, like "and for the last 5 days?".`,
        message,
      )) as { tool?: string | null; confidence?: number; widget?: string | null; new_subject?: boolean; adjusts_previous?: boolean };
      const p = Math.max(0, Math.min(1, Number(out.confidence ?? 0.8)));
      const chosen = tools.find((t) => t.id === out.tool);
      return {
        by: `${llm.name} router`,
        ms: Date.now() - t0,
        tools: chosen ? [{ id: chosen.id, p }, ...tools.filter((t) => t !== chosen).map((t) => ({ id: t.id, p: (1 - p) / tools.length }))] : tools.map((t) => ({ id: t.id, p: 0 })),
        none: chosen ? 1 - p : 0.9,
        widgets: Object.fromEntries(widgets.map((w) => [w.id, w.id === out.widget ? 0.9 : 0])),
        newSubject: out.new_subject ? 0.9 : 0.1,
        followUp: out.adjusts_previous ? 0.9 : 0.1,
      };
    },
  };
}
