/**
 * Route: turn a message into quick decisions (which tool, which widget, is it a follow-up?) by asking
 * System One. With many tools it asks for the server first, then the tool on it. When it's unsure which
 * tool is meant, a second opinion (the LLM) chooses from its shortlist.
 */
import type { WidgetSpec } from "./frame.ts";
import { yes, type Answers, type SystemOne } from "./systemone.ts";
import type { ToolInfo } from "./types.ts";

/** How sure System One must be before the engine acts without asking. */
export const THRESHOLDS = {
  tool: 0.55,
  /** Pick a widget the user asked for. */
  widget: 0.6,
  /** Stricter: treat the message as "only change the view" and skip the LLM and the data call. */
  viewOnly: 0.75,
  viewOnlySubject: 0.3,
  /** Below this, the message names nothing new. */
  subject: 0.5,
  /** Below this, the message is not adjusting the previous result (off-topic chat). */
  followUp: 0.33,
  /** Above this, System One is confident no tool fits, so there's no second opinion. */
  offTopic: 0.85,
};

export interface Route {
  by: string;
  ms: number;
  /** Candidate tools, most likely first. */
  tools: { id: string; p: number }[];
  /** System One's own top tools, in its order, even when the second opinion chose. */
  shortlist: string[];
  /** Probability the message asks for none of the tools. */
  none: number;
  /** Probability the user explicitly asked for each widget, by widget id. */
  widgets: Record<string, number>;
  /** The message names something new (a place, company, topic, time period). */
  subject: number;
  /** The message adjusts the previous result ("and for the last 5 days?"). Low for off-topic chat. */
  followUp: number;
  /** The message is about the user's own things ("my PRs", "who am I"). */
  aboutMe: number;
}

const SUBJECT = "Does the message name a specific place, company, coin, currency, topic, person or time period?";
const FOLLOW_UP = "Does the message ask to change or adjust the previous result, for example a different time range, place or item?";
const ABOUT_ME = "Does the message ask about the user's own account or things, using words like I, me, my or mine?";
const SOURCE = "Which data source is this message asking for?";
const NONE = { none: "the message does not ask for any of these" };
/** Above this many tools across several servers, pick the server first, then the tool. */
const TWO_STEP_ABOVE = 12;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
/** The first sentence: tool descriptions often go on for paragraphs, and every token costs time. */
const firstSentence = (s: string) => s.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? s;
const toolOptions = (tools: ToolInfo[]) => Object.fromEntries(tools.map((t) => [t.id, clip(`${t.title}: ${firstSentence(t.description)}`, 150)]));
const VERB = /^(get|list|search|read|fetch|find|show|query|lookup|view|create|update|delete|add|remove|set|run|call)\s+/i;

/** A whole server in one line: what it says about itself, plus what its tools are about ("List branches" → "branches"). */
function serverOption(tools: ToolInfo[]) {
  const about = tools[0].serverInfo ? firstSentence(tools[0].serverInfo) + " " : "";
  if (tools.length === 1) return clip(`${about}${tools[0].title}: ${firstSentence(tools[0].description)}`, 300);
  const topics = new Set(tools.map((t) => t.title.replace(/[_-]/g, " ").replace(VERB, "").toLowerCase().trim()));
  return clip(`${about}About: ${[...topics].join(", ")}.`, 400);
}

const ranked = (probs: Record<string, number> = {}) =>
  Object.entries(probs).filter(([id]) => id !== "none").map(([id, p]) => ({ id, p })).sort((x, y) => y.p - x.p);

export async function route(message: string, tools: ToolInfo[], widgets: WidgetSpec[], s1: SystemOne, second?: SystemOne, context?: string): Promise<Route> {
  const t0 = Date.now();
  const servers = Map.groupBy(tools, (t) => t.server);
  const twoStep = servers.size > 1 && tools.length > TWO_STEP_ABOVE;
  const first = twoStep ? "server" : "tool";
  const a: Answers = await s1.decide(message, {
    [first]: { ask: SOURCE, options: { ...(twoStep ? Object.fromEntries([...servers].map(([s, ts]) => [s, serverOption(ts)])) : toolOptions(tools)), ...NONE } },
    subject: SUBJECT,
    followup: FOLLOW_UP,
    self: ABOUT_ME,
    // One yes/no question per widget is much sharper than one multiple-choice question.
    ...Object.fromEntries(widgets.map((w) => [`widget:${w.id}`, w.ask])),
  }, context);
  let best = ranked(a[first]), none = a[first]?.none ?? 0, by = s1.name;

  // Two steps: the tool on the likeliest server (and on the runner-up when that was close). P(tool) = P(server) × P(tool | server).
  if (twoStep) {
    const look = best.slice(0, best[0]?.p >= 0.8 ? 1 : 2).filter((s) => s.p >= 0.05);
    best = (await Promise.all(look.map(async (s) => {
      const ts = servers.get(s.id)!;
      if (ts.length === 1) return [{ id: ts[0].id, p: s.p }];
      const b = await s1.decide(message, { tool: { ask: "Which of these tools answers the message?", options: toolOptions(ts) } });
      return ranked(b.tool).map((t) => ({ id: t.id, p: t.p * s.p }));
    }))).flat().sort((x, y) => y.p - x.p);
  }

  const widgetP = Object.fromEntries(widgets.map((w) => [w.id, yes(a, `widget:${w.id}`)]));
  const viewOnly = Math.max(0, ...Object.values(widgetP)) >= THRESHOLDS.viewOnly && yes(a, "subject") < THRESHOLDS.subject;
  // System One's top guess is usually right even when it isn't sure (confidence spreads across similar tools), so a
  // second opinion on its shortlist is cheap and worth it. Not when it's sure, the message only changes the view, or nothing fits.
  const shortlist = best.slice(0, 6).map((t) => t.id);
  if (second && (best[0]?.p ?? 0) < THRESHOLDS.tool && !viewOnly && none < THRESHOLDS.offTopic) {
    const candidates = shortlist.length ? tools.filter((t) => shortlist.includes(t.id)) : tools;
    const b = await second.decide(message, { tool: { ask: SOURCE, options: { ...toolOptions(candidates), ...NONE } } }, context);
    [best, none, by] = [ranked(b.tool), b.tool?.none ?? 0, `${s1.name} → ${second.name} (${candidates.length} tools)`];
  }
  return { by, ms: Date.now() - t0, tools: best, shortlist, none, widgets: widgetP, subject: yes(a, "subject"), followUp: yes(a, "followup"), aboutMe: yes(a, "self") };
}
