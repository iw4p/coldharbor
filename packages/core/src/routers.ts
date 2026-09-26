import type { LLM, RouteDecision, Router, ToolInfo, WidgetSpec } from "./types.ts";

const SUBJECT = "Does the message name a specific place, company, coin, currency, topic, person or time period?";
const FOLLOW_UP = "Does the message ask to change or adjust the previous result, for example a different time range, place or item?";
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** The first sentence: tool descriptions often go on for paragraphs, and every token costs time. */
const firstSentence = (s: string) => s.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? s;
const toolOption = (t: ToolInfo) => clip(`${t.title}: ${firstSentence(t.description)}`, 150);

const VERB = /^(get|list|search|read|fetch|find|show|query|lookup|view|create|update|delete|add|remove|set|run|call)\s+/i;

/**
 * A description of a whole server: what it says about itself, plus what its tools are about.
 * "List branches", "Search code", "Get file contents" → "branches, code, file contents", so even
 * a server with dozens of tools fits in one short line that still mentions everything it covers.
 */
function serverOption(tools: ToolInfo[]) {
  const about = tools[0]?.serverInfo ? firstSentence(tools[0].serverInfo) + " " : "";
  if (tools.length === 1) return clip(`${about}${tools[0].title}: ${firstSentence(tools[0].description)}`, 300);
  const topics = [...new Set(tools.map((t) => t.title.replace(/[_-]/g, " ").replace(VERB, "").toLowerCase().trim()))];
  return clip(`${about}About: ${topics.join(", ")}.`, 400);
}

/** Above this many tools across several servers, pick the server first, then the tool. */
const TWO_STEP_ABOVE = 12;

/**
 * Kev (https://github.com/jaredpalmer/kev): a small local decision model that answers
 * multiple-choice and yes/no questions with calibrated probabilities in about a second.
 *
 * Small catalogs: one request (which tool? which widget? follow-up?).
 * Large catalogs: first "which server?" alongside the other questions, then "which tool on that
 * server?". Two small choices are faster and much more confident than one choice among dozens.
 */
export function kevRouter(opts: { baseUrl: string; apiKey?: string }): Router {
  const ask = async (message: string, questions: Record<string, unknown>) => {
    const res = await fetch(`${opts.baseUrl}/v1/systemone`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
      body: JSON.stringify({ state: message, model: "kev-latest", questions }),
    });
    if (!res.ok) throw new Error(`Kev returned ${res.status}: ${await res.text()}`);
    return (await res.json()).answers;
  };
  const sorted = (probs: Record<string, number>) => Object.entries(probs).filter(([id]) => id !== "none").map(([id, p]) => ({ id, p })).sort((x, y) => y.p - x.p);

  return {
    name: "Kev",
    async route(message: string, tools: ToolInfo[], widgets: WidgetSpec[]): Promise<RouteDecision> {
      const t0 = Date.now();
      const byServer = new Map<string, ToolInfo[]>();
      for (const t of tools) byServer.set(t.server, [...(byServer.get(t.server) ?? []), t]);
      const twoStep = byServer.size > 1 && tools.length > TWO_STEP_ABOVE;

      const a = await ask(message, {
        ...(twoStep
          ? { server: { type: "choice", instructions: "Which data source is this message asking for?",
              criteria: { ...Object.fromEntries([...byServer].map(([s, ts]) => [s, serverOption(ts)])), none: "the message does not ask for any of these" } } }
          : { tool: { type: "choice", instructions: "Which data source is this message asking for?",
              criteria: { ...Object.fromEntries(tools.map((t) => [t.id, toolOption(t)])), none: "the message does not ask for any of these" } } }),
        subject: { type: "noul", instructions: SUBJECT },
        followup: { type: "noul", instructions: FOLLOW_UP },
        // One yes/no question per widget is much sharper than one multiple-choice question.
        ...Object.fromEntries(widgets.map((w) => [`widget:${w.id}`, { type: "noul", instructions: w.ask }])),
      });
      const common = {
        by: "Kev",
        widgets: Object.fromEntries(widgets.map((w) => [w.id, a[`widget:${w.id}`].noul])),
        newSubject: a.subject.noul,
        followUp: a.followup.noul,
      };

      if (!twoStep) {
        const ranked = sorted(a.tool.probabilities);
        return { ...common, ms: Date.now() - t0, tools: ranked, none: a.tool.probabilities.none ?? 0, shortlist: ranked.slice(0, 6).map((t) => t.id) };
      }

      // Step 2: which tool, on the likeliest server (and the runner-up when step 1 was unsure).
      const servers = sorted(a.server.probabilities);
      const look = servers.slice(0, servers[0].p >= 0.8 ? 1 : 2).filter((s) => s.p >= 0.05);
      const ranked = (await Promise.all(look.map(async (s) => {
        const ts = byServer.get(s.id)!;
        if (ts.length === 1) return [{ id: ts[0].id, p: s.p }];
        const b = await ask(message, { tool: { type: "choice", instructions: "Which of these tools answers the message?",
          criteria: Object.fromEntries(ts.map((t) => [t.id, toolOption(t)])) } });
        // P(tool) = P(server) × P(tool | server): calibrated, so thresholds keep their meaning.
        return sorted(b.tool.probabilities).map((t) => ({ id: t.id, p: t.p * s.p }));
      }))).flat().sort((x, y) => y.p - x.p);
      return { ...common, ms: Date.now() - t0, tools: ranked, none: a.server.probabilities.none ?? 0, servers, shortlist: ranked.slice(0, 6).map((t) => t.id) };
    },
  };
}

/**
 * Kev first; the LLM only when Kev is unsure which tool a message means, and then only among
 * Kev's shortlist, so the LLM's prompt stays small and fast however many tools are connected.
 * Widget requests always come from Kev: the LLM tends to invent them.
 */
export function hybridRouter(kev: Router, llm: Router, opts = { toolThreshold: 0.55, viewOnly: 0.75, subject: 0.5, offTopic: 0.85 }): Router {
  return {
    name: "Kev + LLM",
    async route(message, tools, widgets) {
      const k = await kev.route(message, tools, widgets);
      const sure = (k.tools[0]?.p ?? 0) >= opts.toolThreshold;
      const viewOnly = Math.max(0, ...Object.values(k.widgets)) >= opts.viewOnly && k.newSubject < opts.subject;
      // Kev's top guess is usually right even when it isn't sure (confidence spreads across similar tools),
      // so a second opinion on its shortlist is cheap and worth it. Skip it only when Kev is sure, the message
      // just changes the view, or Kev is confident nothing fits (off-topic chat).
      if (sure || viewOnly || k.none >= opts.offTopic) return k;
      // Kev's shortlist; else the likeliest server's tools; else everything.
      const top = k.servers?.[0]?.id;
      let candidates = tools.filter((t) => k.shortlist?.includes(t.id));
      if (!candidates.length && top) candidates = tools.filter((t) => t.server === top);
      if (!candidates.length) candidates = tools;
      const l = await llm.route(message, candidates, widgets);
      return { ...l, widgets: k.widgets, newSubject: k.newSubject, followUp: k.followUp, servers: k.servers, by: `Kev → ${l.by} (${candidates.length} tools)`, ms: k.ms + l.ms };
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
