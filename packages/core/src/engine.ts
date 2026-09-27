import { labelField, type Frame, type Value } from "./frame.ts";
import type { Args, EngineEvent, Focus, InputField, LLM, Router, Tile, ToolInfo, ToolRunner, TraceStep, WidgetSpec } from "./types.ts";

export interface EngineDeps {
  router: Router;
  llm: LLM;
  tools: ToolRunner;
  widgets: WidgetSpec[];
}

export interface AskInput {
  message: string;
  focus?: Focus;
  /** Set when the user answered a clarifying question. */
  forceTool?: string;
  /** Set when the user approved a tool call that needed confirmation, or filled in missing arguments. */
  confirmed?: { toolId: string; args: Args };
  /** Argument values used earlier in the conversation (e.g. by tiles on the canvas), newest winning. */
  known?: Args;
}

/** How sure the router must be before we act without asking. */
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
};

const pct = (p: number) => `${Math.round(p * 100)}%`;
const top = (r: Record<string, number>) => Object.entries(r).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];

/**
 * One message in, a stream of events out:
 *   route (which tool? which widget?) → fill arguments (LLM) → call the tool (MCP) → pick a widget.
 * Every stage is skipped when it isn't needed, and every decision is reported as a step.
 */
export async function* ask(input: AskInput, deps: EngineDeps): AsyncGenerator<EngineEvent> {
  const { message, focus, forceTool } = input;
  const trace: TraceStep[] = [];
  const step = (who: string, text: string, ms?: number): EngineEvent => {
    const s = { who, text, ms };
    trace.push(s);
    return { type: "step", step: s };
  };

  const tools = await deps.tools.list();
  if (!tools.length) {
    yield { type: "error", message: "No tools are connected. Add an MCP server to coldharbor.config.json." };
    return;
  }

  // An approved call: run exactly what the user saw, nothing else.
  if (input.confirmed) {
    const tool = tools.find((t) => t.id === input.confirmed!.toolId);
    if (!tool) return void (yield { type: "error", message: `Unknown tool ${input.confirmed.toolId}` });
    const t0 = Date.now();
    const frames = titled(await deps.tools.call(tool.id, input.confirmed.args), tool, input.confirmed.args);
    yield step(tool.server, `${tool.name} (approved) → ${frames.length} frame${frames.length === 1 ? "" : "s"}`, Date.now() - t0);
    const fits = rankWidgets(deps.widgets, frames);
    yield { type: "tile", tile: { id: crypto.randomUUID(), toolId: tool.id, args: input.confirmed.args, frames, widget: fits[0]?.id ?? "text", title: frames[0]?.title ?? tool.title, createdAt: Date.now(), trace } };
    return;
  }

  // 1 · Route
  const context = focus ? `the user is looking at "${focus.frames[0]?.title ?? focus.toolId}" from ${focus.toolId} ${JSON.stringify(focus.args)}` : undefined;
  const r = await deps.router.route(message, tools, deps.widgets, context);
  const [askedWidget, askedP] = top(r.widgets);
  const best = r.tools[0];
  yield step(r.by, `tool ${r.tools.slice(0, 3).map((t) => `${t.id} ${pct(t.p)}`).join(" · ")}` +
    (askedP >= 0.5 ? ` · asked for ${askedWidget} ${pct(askedP)}` : "") + ` · new subject ${pct(r.newSubject)} · follow-up ${pct(r.followUp)}`, r.ms);

  // No tool, no view request, nothing new named and not adjusting the last result: nothing to do.
  if (!forceTool && focus && (best?.p ?? 0) < THRESHOLDS.tool && askedP < THRESHOLDS.viewOnly && r.newSubject < THRESHOLDS.subject && r.followUp < THRESHOLDS.followUp) {
    yield { type: "say", text: `That doesn't look like something your sources can answer. Your canvas stays as it is.` };
    return;
  }

  let toolId: string;
  if (forceTool) toolId = forceTool;
  else if (best && best.p >= THRESHOLDS.tool) toolId = best.id;
  else if (focus) {
    toolId = focus.toolId;
    yield step("engine", `no clear tool in this message, so continuing with ${toolId}`);
  } else {
    yield {
      type: "clarify",
      question: r.none > 0.8 ? "That doesn't look like a request for any connected source. Did you mean one of these?" : "I'm not sure which source you mean. Which one?",
      options: r.tools.slice(0, 5).map((t) => ({ toolId: t.id, label: tools.find((x) => x.id === t.id)?.title ?? t.id, p: t.p })),
    };
    return;
  }
  const found = tools.find((t) => t.id === toolId);
  if (!found) {
    yield { type: "error", message: `Unknown tool ${toolId}` };
    return;
  }
  let tool: ToolInfo = found;

  // 2 · Data: reuse, or fill arguments and call the tool
  let same = focus?.toolId === toolId;
  let args: Args;
  let frames: Frame[];
  let reused = false;
  if (same && r.newSubject < THRESHOLDS.viewOnlySubject && askedP >= THRESHOLDS.viewOnly) {
    ({ args, frames } = focus!);
    reused = true;
    yield step("engine", "only a view change, so no LLM call and no new data");
  } else {
    // "my …", "do I …": ask the server who the user is (once per server), so the LLM can fill in their username.
    let me: Record<string, Value> | undefined;
    const idTool = (r.aboutMe ?? 0) >= 0.5 && !isIdentityTool(tool) ? tools.find((t) => t.server === tool.server && t.autoRun && isIdentityTool(t)) : undefined;
    if (idTool) {
      const t0 = Date.now();
      me = identities.get(tool.server) ?? (await whoAmI(deps.tools, idTool));
      identities.set(tool.server, me);
      yield step(tool.server, `${idTool.name} → you are ${Object.values(me)[0] ?? "?"}`, Date.now() - t0);
    }

    /** Fill a tool's arguments from the message, the conversation and the user's identity; report what's still missing. */
    const prepare = async (t: ToolInfo) => {
      const sameTool = focus?.toolId === t.id;
      const known = relevant(input.known, t);
      const a = await fillArgs(deps.llm, t, message, sameTool ? focus!.args : undefined, known, me);
      // Values nobody gave: small LLMs fill "owner" with a famous repo rather than leave it empty.
      const invented = await ungrounded(deps.router, t, a, message, [known, me, sameTool ? focus!.args : undefined]);
      for (const k of invented) delete a[k];
      // Required values the LLM left out but the conversation already has ("and the issues?" after naming a repo).
      for (const k of t.inputSchema.required ?? []) if ((a[k] == null || a[k] === "") && known[k] != null) a[k] = known[k];
      return { args: a, invented, missing: missingArgs(t, a) };
    };

    let t0 = Date.now();
    let prep = await prepare(tool);
    if (prep.invented.length) yield step("engine", `dropped ${prep.invented.join(", ")}: not in your message or the conversation`);
    yield step(deps.llm.name, JSON.stringify(prep.args), Date.now() - t0);

    // The chosen tool needs something nobody said. Before asking, try the next likely tools on the same server:
    // "do I have open PRs?" can't name a repo for a per-repo list, but a search tool only needs a query.
    if (prep.missing.length && !forceTool) {
      // Kev's shortlist, tools that need fewer things first (a search needs a query; a per-item read needs ids).
      const need = (x: ToolInfo) => x.inputSchema.required?.length ?? 0;
      const alternatives = (r.shortlist ?? r.tools.map((x) => x.id))
        .map((id) => tools.find((x) => x.id === id))
        .filter((x): x is ToolInfo => !!x && x.id !== tool.id && x.server === tool.server && !isIdentityTool(x))
        .slice(0, 5)
        .sort((a, b) => need(a) - need(b))
        .slice(0, 3);
      for (const alt of alternatives) {
        t0 = Date.now();
        const p = await prepare(alt);
        if (p.missing.length) continue;
        yield step("engine", `${tool.name} needs ${prep.missing.map((f) => f.name).join(", ")}; ${alt.name} doesn't, so using it`);
        yield step(deps.llm.name, JSON.stringify(p.args), Date.now() - t0);
        [tool, toolId, prep, same] = [alt, alt.id, p, focus?.toolId === alt.id];
        break;
      }
    }
    args = prep.args;
    // Required arguments nobody gave: ask, don't guess.
    if (prep.missing.length) {
      yield step("engine", `${tool.name} needs ${prep.missing.map((f) => f.name).join(", ")}, so asking`);
      yield { type: "needs-input", toolId, title: tool.title, args, fields: prep.missing, readOnly: tool.readOnly };
      return;
    }
    if (!tool.autoRun && !(same && sameArgs(args, focus!.args))) {
      yield step("engine", `${tool.name} ${tool.readOnly ? "isn't set to run automatically" : "can change things"}, so asking first`);
      yield { type: "confirm", toolId, title: tool.title, args, readOnly: tool.readOnly };
      return;
    }
    if (same && sameArgs(args, focus!.args)) {
      frames = focus!.frames;
      reused = true;
      yield step("engine", "nothing new to fetch, reusing the data");
    } else {
      const t1 = Date.now();
      frames = titled(await deps.tools.call(toolId, args), tool, args);
      yield step(tool.server, `${tool.name} → ${frames.length} frame${frames.length === 1 ? "" : "s"}, ${frames.reduce((n, f) => n + f.rows.length, 0)} rows`, Date.now() - t1);
    }
  }

  // 3 · Widget
  const fits = rankWidgets(deps.widgets, frames);
  if (!fits.length) {
    yield { type: "error", message: "No widget can draw this data." };
    return;
  }
  let widget: string;
  let why: string;
  const asked = fits.filter((f) => (r.widgets[f.id] ?? 0) >= THRESHOLDS.widget).sort((a, b) => r.widgets[b.id] - r.widgets[a.id])[0];
  if (asked) [widget, why] = [asked.id, `you asked for it (${pct(r.widgets[asked.id])})`];
  else if (askedP >= THRESHOLDS.viewOnly) [widget, why] = [fits[0].id, `${askedWidget} can't draw this data, so the best fit instead`];
  else if (same && fits.some((f) => f.id === focus!.widget)) [widget, why] = [focus!.widget, "same view as before"];
  else [widget, why] = [fits[0].id, "best fit for this data"];
  yield step("engine", `${deps.widgets.find((w) => w.id === widget)?.name ?? widget}: ${why}`);

  const tile: Tile = {
    id: reused && focus ? focus.tileId : crypto.randomUUID(),
    toolId, args, frames, widget,
    title: frames[0]?.title ?? tool.title,
    createdAt: Date.now(),
    trace,
  };
  yield { type: "tile", tile, replaces: reused ? focus?.tileId : undefined };
}

/**
 * Widgets that can draw at least one of the frames, best first.
 * A source's first frame is its main answer, and its `prefer` hints nudge the choice.
 */
export function rankWidgets(widgets: WidgetSpec[], frames: Frame[]) {
  return widgets
    .map((w) => {
      const score = Math.max(0, ...frames.map((f, i) => {
        const s = w.score(f);
        if (s <= 0) return 0;
        const prefer = f.prefer?.includes(w.id) ? 0.15 - 0.03 * f.prefer.indexOf(w.id) : 0;
        return s + prefer + (i === 0 ? 0.25 : 0);
      }));
      return { id: w.id, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** The frame a widget should draw: the one it scores highest. */
export function frameFor(widget: WidgetSpec, frames: Frame[]): Frame | undefined {
  return [...frames].sort((a, b) => widget.score(b) - widget.score(a))[0];
}

/** "List commits · iw4p / coldharbor": the tool's name plus the arguments that say what it's about. */
const NOISE_ARG = /page|limit|sort|order|direction|fields|method|format|cursor|after|before|since|until|detail|minimal|sha|ref/i;
function niceTitle(tool: ToolInfo, args: Args) {
  const about = Object.entries(args)
    .filter(([k, v]) => typeof v === "string" && v && v.length <= 40 && !NOISE_ARG.test(k))
    .map(([, v]) => v as string);
  const name = tool.title.charAt(0).toUpperCase() + tool.title.slice(1);
  return about.length ? `${name} · ${about.join(" / ")}` : name;
}

/** Frames that only got the tool's id as a title (inferred from plain JSON) get a readable one. */
function titled(frames: Frame[], tool: ToolInfo, args: Args): Frame[] {
  const nice = niceTitle(tool, args);
  return frames.map((f) => (f.title === tool.name || f.title.startsWith(`${tool.name} · `) ? { ...f, title: f.title.replace(tool.name, nice) } : f));
}

/** Answers from each server's "who am I" tool, for the life of the process. */
const identities = new Map<string, Record<string, Value>>();

/**
 * A server's "who am I" tool: read-only, needs no arguments, and says so in its name or description
 * (get_me, whoami, current_user, viewer…). Any server can have one; none is special-cased.
 */
export function isIdentityTool(t: ToolInfo) {
  if (!t.readOnly || t.inputSchema.required?.length) return false;
  return /(^|[_\-.])(me|whoami|current_?user|viewer|self|my_?(profile|account|user))($|[_\-.])/i.test(t.name)
    || /\b(authenticated|current|logged[- ]in|signed[- ]in) user\b|\bwho (i am|you are)\b/i.test(t.description);
}

/** The first record the identity tool returns, reduced to short values (login, name, …). */
async function whoAmI(runner: ToolRunner, idTool: ToolInfo): Promise<Record<string, Value>> {
  const [f] = await runner.call(idTool.id, {});
  const row = f?.rows[0] ?? {};
  const label = f && labelField(f)?.name;
  const short = Object.entries(row).filter(([, v]) => v != null && String(v).length <= 60 && !/^https?:/.test(String(v)));
  if (label) short.sort(([a], [b]) => (a === label ? -1 : b === label ? 1 : 0));
  return Object.fromEntries(short.slice(0, 8));
}

/** Only the remembered values whose names this tool actually takes. */
function relevant(known: Args | undefined, tool: ToolInfo): Args {
  const props = tool.inputSchema.properties ?? {};
  return Object.fromEntries(Object.entries(known ?? {}).filter(([k, v]) => k in props && v != null && typeof v !== "object"));
}

/**
 * Text arguments the LLM filled in that nothing supports. A value counts as made up only when
 * (1) none of its words appear in the message, the conversation or the user's identity, and
 * (2) Kev, asked "Does the message say which <argument> to use?", says no. (1) alone would reject
 * good conversions like "Apple" → "AAPL"; (2) keeps them. Allowed values (enums) are never dropped.
 */
async function ungrounded(router: Router, tool: ToolInfo, args: Args, message: string, context: unknown[]): Promise<string[]> {
  const props = tool.inputSchema.properties ?? {};
  const seen = (message + " " + JSON.stringify(context)).toLowerCase();
  const words = (v: string) => v.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const suspects = Object.entries(args).filter(([k, v]) => {
    const p = (props[k] ?? {}) as { enum?: unknown[]; default?: unknown };
    if (v == null || v === "" || p.enum?.includes(v) || p.default === v) return false;
    // Required numbers are ids (an issue number): invented ones look just as plausible as real ones.
    // Optional numbers are usually conversions ("last 3 months" → days: 90) and are left alone.
    if (typeof v === "number") return !!tool.inputSchema.required?.includes(k) && !new RegExp(`(^|\\D)${v}(\\D|$)`).test(seen);
    if (typeof v !== "string") return false;
    const ws = words(v);
    return ws.length > 0 && !ws.some((w) => seen.includes(w));
  }).map(([k]) => k);
  if (!suspects.length) return [];
  if (!router.yesNo) return suspects;
  const about = (k: string) => {
    const d = ((props[k] ?? {}) as { description?: string }).description;
    return d ? `${d.split(/(?<=[.!?])\s/)[0].replace(/\.$/, "").toLowerCase()} (${k})` : k.replace(/_/g, " ");
  };
  const ps = await router.yesNo(message, suspects.map((k) => `Does the message say which ${about(k)} to use?`));
  return suspects.filter((_, i) => ps[i] < 0.5);
}

/** A value an LLM writes when it doesn't know: "<owner>", "unknown", "your_username"… */
const PLACEHOLDER = /^(<.*>|\{.*\}|unknown|none|null|n\/a|tbd|\?+|your[_ -].*|example.*|placeholder.*)$/i;

function missingArgs(tool: ToolInfo, args: Args): InputField[] {
  const props = tool.inputSchema.properties ?? {};
  return (tool.inputSchema.required ?? [])
    .filter((k) => args[k] == null || args[k] === "" || (typeof args[k] === "string" && PLACEHOLDER.test((args[k] as string).trim())))
    .map((k) => {
      const p = (props[k] ?? {}) as { description?: string; type?: string; enum?: unknown[] };
      return { name: k, description: p.description, type: p.type, enum: p.enum?.map(String) };
    });
}

async function fillArgs(llm: LLM, tool: ToolInfo, message: string, previous?: Args, known?: Args, me?: Record<string, Value>): Promise<Args> {
  const props = tool.inputSchema.properties ?? {};
  if (!Object.keys(props).length) return {};
  const system =
    `You fill in the arguments for the tool "${tool.title}": ${tool.description}\n` +
    `The arguments must match this JSON Schema:\n${JSON.stringify(tool.inputSchema)}\n` +
    `Reply with the arguments as a JSON object and nothing else. If the message doesn't mention a value, keep the previous value or use a sensible default. ` +
    `"what about X?", "and in X?" or "now X" means replace the previous value with X. ` +
    `"compare with X", "X vs Y", "X and Y" or "add X" means include both.`;
  const user = [
    `Previous arguments: ${previous ? JSON.stringify(previous) : "none"}`,
    known && Object.keys(known).length ? `Values used earlier in this conversation (use them when the message refers to the same thing or doesn't say): ${JSON.stringify(known)}` : "",
    me ? `The user is ${JSON.stringify(me)}. "my", "mine" and "me" refer to this user.` : "",
    `If a required value is unknown, leave it out rather than inventing one.`,
    `Message: ${message}`,
  ].filter(Boolean).join("\n");
  const out = (await llm.json(system, user)) as Args;
  const args: Args = { ...(previous ?? {}) };
  for (const k of Object.keys(props)) if (out?.[k] !== undefined && out[k] !== null) args[k] = out[k];
  return args;
}

function sameArgs(a: Args, b: Args) {
  const norm = (x: Args) => JSON.stringify(Object.keys(x).sort().map((k) => [k, x[k]]));
  return norm(a) === norm(b);
}
