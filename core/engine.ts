/**
 * One message in, a stream of events out:  route → fill → gate → fetch → draw.
 * Every stage is skipped when it isn't needed, and every decision is reported as a step.
 */
import { measures, rankWidgets, type Frame, type Value, type WidgetSpec } from "./frame.ts";
import { fill, type Filled } from "./fill.ts";
import { contents, identity, isIdentityTool } from "./hints.ts";
import { route, THRESHOLDS as T, type Route } from "./route.ts";
import type { SystemOne } from "./systemone.ts";
import type { Args, Call, EngineEvent, LLM, Step, Tile, ToolInfo, ToolRunner } from "./types.ts";

export interface Deps {
  /** Answers the quick questions. */
  s1: SystemOne;
  /** Chooses from System One's shortlist when it's unsure which tool is meant. */
  second?: SystemOne;
  /** Fills in tool arguments. */
  llm: LLM;
  tools: ToolRunner;
  widgets: WidgetSpec[];
}

export interface AskInput {
  message: string;
  /** The tile the user is looking at, so follow-ups like "as a table" have context. */
  focus?: Tile;
  /** Argument values the conversation already has (owner, repo, city…). */
  known?: Args;
  /** The tool the user picked when asked "which one?". */
  tool?: string;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const top = (r: Record<string, number>) => Object.entries(r).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
const same = (a: Args, b: Args) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/** Steps are streamed as they happen and kept on the tile ("Why this?"). */
function stepper() {
  const trace: Step[] = [];
  return { trace, step: (who: string, text: string, ms?: number): EngineEvent => (trace.push({ who, text, ms }), { type: "step", step: { who, text, ms } }) };
}
type Stepper = ReturnType<typeof stepper>;

export async function* ask({ message, focus, known, tool: picked }: AskInput, deps: Deps): AsyncGenerator<EngineEvent> {
  const s = stepper(), step = s.step;
  const tools = await deps.tools.list();
  if (!tools.length) return yield { type: "error", message: "No tools are connected. Add an MCP server to coldharbor.config.json." };

  // 1 · Route
  const context = focus && `the user is looking at "${focus.frames[0]?.title ?? focus.toolId}" from ${focus.toolId} ${JSON.stringify(focus.args)}`;
  const r = await route(message, tools, deps.widgets, deps.s1, deps.second, context);
  const [asked, askedP] = top(r.widgets), best = r.tools[0], sure = (best?.p ?? 0) >= T.tool;
  yield step(r.by, (r.tools.length ? `tool ${r.tools.slice(0, 3).map((t) => `${t.id} ${pct(t.p)}`).join(" · ")}` : "no tool") +
    (askedP >= 0.5 ? ` · asked for ${asked} ${pct(askedP)}` : "") + ` · new subject ${pct(r.subject)} · follow-up ${pct(r.followUp)}`, r.ms);

  // No tool, no view request, nothing new named and not adjusting the last result: nothing to do.
  if (!picked && focus && !sure && askedP < T.viewOnly && r.subject < T.subject && r.followUp < T.followUp)
    return yield { type: "say", text: "That doesn't look like something your sources can answer. Your canvas stays as it is." };
  const toolId = picked ?? (sure ? best.id : focus?.toolId);
  if (!toolId) return yield {
    type: "clarify",
    question: r.none > 0.8 ? "That doesn't look like a request for any connected source. Did you mean one of these?" : "I'm not sure which source you mean. Which one?",
    options: r.tools.slice(0, 5).map((t) => ({ toolId: t.id, label: tools.find((x) => x.id === t.id)?.title ?? t.id, p: t.p })),
  };
  if (!picked && !sure) yield step("engine", `no clear tool in this message, so continuing with ${toolId}`);
  let tool = tools.find((t) => t.id === toolId);
  if (!tool) return yield { type: "error", message: `Unknown tool ${toolId}` };

  // "as a table" on the tile you're looking at: only the view changes.
  if (focus?.toolId === tool.id && r.subject < T.viewOnlySubject && askedP >= T.viewOnly) {
    yield step("engine", "only a view change, so no LLM call and no new data");
    return yield* draw(s, deps.widgets, { toolId: focus.toolId, args: focus.args }, focus.frames, { r, previous: focus, replace: focus });
  }

  // 2 · Fill: hints about the server, then the arguments
  const me = r.aboutMe >= 0.5 ? yield* identity(deps.tools, tools, tool, step) : undefined;
  const has = yield* contents(deps.tools, tools, tool.server, step);
  const fillFor = (t: ToolInfo, rejected?: string) =>
    fill(t, { message, previous: focus?.toolId === t.id ? focus.args : undefined, known, me, contents: has, rejected }, deps.llm, deps.s1);
  const report = (f: Filled) => [
    ...(f.dropped.length ? [step("engine", `dropped ${f.dropped.join(", ")}: not in your message or the conversation`)] : []),
    step(deps.llm.name, JSON.stringify(f.args), f.ms),
  ];
  let f = await fillFor(tool);
  yield* report(f);

  // The tool needs something nobody said. Before asking, try the next likely tools on the same server, those that need
  // fewer things first: "do I have open PRs?" can't name a repo for a per-repo list, but a search only needs a query.
  if (f.missing.length && !picked) {
    const need = (x: ToolInfo) => x.inputSchema.required?.length ?? 0, first = tool;
    const alternatives = r.shortlist.map((id) => tools.find((t) => t.id === id))
      .filter((x): x is ToolInfo => !!x && x.id !== first.id && x.server === first.server && !isIdentityTool(x)).slice(0, 5).sort((a, b) => need(a) - need(b));
    for (const alt of alternatives.slice(0, 3)) {
      const g = await fillFor(alt);
      if (g.missing.length) continue;
      yield step("engine", `${tool.name} needs ${f.missing.map((x) => x.name).join(", ")}; ${alt.name} doesn't, so using it`);
      yield* report(g);
      [tool, f] = [alt, g];
      break;
    }
  }

  // 3 · Gate: ask for what's missing, and before anything that isn't set to run on its own.
  const call = { toolId: tool.id, args: f.args }, again = focus?.toolId === tool.id && same(f.args, focus.args);
  if (f.missing.length) {
    yield step("engine", `${tool.name} needs ${f.missing.map((x) => x.name).join(", ")}, so asking`);
    return yield { type: "needs-input", call, title: tool.title, fields: f.missing, readOnly: tool.readOnly };
  }
  if (!tool.autoRun && !again) {
    yield step("engine", `${tool.name} ${tool.readOnly ? "isn't set to run automatically" : "can change things"}, so asking first`);
    return yield { type: "confirm", call, title: tool.title, readOnly: tool.readOnly };
  }

  // 4 · Fetch, unless the same call is already on screen. Arguments the server rejects get one fix from the LLM,
  // for tools that run on their own only: a call the user approved is never changed.
  if (again) yield step("engine", "nothing new to fetch, reusing the data");
  let frames: Frame[];
  try {
    frames = again ? focus!.frames : yield* load(s, deps.tools, tool, call, message);
  } catch (e) {
    const rejected = (e as Error).message;
    if (!tool.autoRun || !/invalid (arguments|input|params)/i.test(rejected)) throw e;
    yield step("engine", `${tool.name} rejected the arguments, so ${deps.llm.name} fixes them`);
    f = await fillFor(tool, `${JSON.stringify(f.args)}: ${rejected.slice(0, 400)}`);
    yield* report(f);
    call.args = f.args;
    frames = yield* load(s, deps.tools, tool, call, message);
  }
  yield* draw(s, deps.widgets, call, frames, { r, previous: focus, replace: again ? focus : undefined });
}

/** Runs a call the user approved, or refreshes a tile (only tools that run on their own), and draws it. */
export async function* run(call: Call, deps: Deps, message: string, tile?: Tile): AsyncGenerator<EngineEvent> {
  const s = stepper();
  const tool = (await deps.tools.list()).find((t) => t.id === call.toolId);
  if (!tool) return yield { type: "error", message: `Unknown tool ${call.toolId}` };
  if (tile && !tool.autoRun) return yield { type: "error", message: `${tool.name} isn't set to run on its own, so it isn't refreshed. Ask again to run it.` };
  const frames = yield* load(s, deps.tools, tool, call, message);
  yield* draw(s, deps.widgets, call, frames, { previous: tile, replace: tile });
}

async function* load({ step }: Stepper, runner: ToolRunner, tool: ToolInfo, call: Call, message: string) {
  const t0 = Date.now();
  // "compare bitcoin and ethereum" on a tool that takes one coin: a list where the schema wants one value means one call each.
  const props = tool.inputSchema.properties ?? {};
  const lists = Object.entries(call.args).filter(([k, v]) => Array.isArray(v) && v.length > 1 && props[k]?.type && props[k].type !== "array") as [string, unknown[]][];
  const n = Math.min(5, ...lists.map(([, v]) => v.length));
  const each = lists.length ? Array.from({ length: n }, (_, i) => ({ ...call.args, ...Object.fromEntries(lists.map(([k, v]) => [k, v[i]])) })) : [call.args];
  const results = await Promise.all(each.map((args) => runner.call(call.toolId, args)));
  const frames = titled(lists.length ? merge(results, lists[0][1].slice(0, n).map(String)) : results[0], tool, call.args, message);
  yield step(tool.server, `${tool.name} → ${frames.length} frame${frames.length === 1 ? "" : "s"}, ${frames.reduce((n, f) => n + f.rows.length, 0)} rows`, Date.now() - t0);
  return frames;
}

/** 5 · Draw: the widget you asked for, else the view you had, else the best fit. `replace` is the tile this one updates. */
async function* draw({ step, trace }: Stepper, widgets: WidgetSpec[], call: Call, frames: Frame[], { r, previous, replace }: { r?: Route; previous?: Tile; replace?: Tile }): AsyncGenerator<EngineEvent> {
  const fits = rankWidgets(widgets, frames);
  if (!fits.length) return yield { type: "error", message: "No widget can draw this data." };
  const [asked, askedP] = r ? top(r.widgets) : ["", 0];
  const wanted = r && fits.filter((w) => r.widgets[w.id] >= T.widget).sort((a, b) => r.widgets[b.id] - r.widgets[a.id])[0];
  const [widget, why] = wanted ? [wanted.id, `you asked for it (${pct(r.widgets[wanted.id])})`]
    : askedP >= T.viewOnly ? [fits[0].id, `${asked} can't draw this data, so the best fit instead`]
    : previous?.toolId === call.toolId && fits.some((w) => w.id === previous.widget) ? [previous.widget, "same view as before"]
    : [fits[0].id, "best fit for this data"];
  yield step("engine", `${widgets.find((w) => w.id === widget)?.name ?? widget}: ${why}`);
  const tile: Tile = { ...call, id: replace?.id ?? crypto.randomUUID(), frames, widget, title: frames[0]?.title ?? call.toolId, createdAt: Date.now(), trace };
  yield { type: "tile", tile, replaces: replace?.id };
}

/** One result per compared value, drawn together: series on a shared time axis side by side, anything else as rows named by value. */
function merge(results: Frame[][], names: string[]): Frame[] {
  const firsts = results.map((fs) => fs[0]), time = (f: Frame) => f.fields.find((x) => x.type === "time")?.name;
  if (!firsts.every((f) => f && time(f) && measures(f).length))
    return [{ ...firsts[0], fields: [{ name: "item", type: "string" }, ...firsts[0].fields], rows: firsts.flatMap((f, i) => f.rows.map((r) => ({ item: names[i], ...r }))), labelField: "item" }];
  const rows = new Map<Value, Record<string, Value>>();
  firsts.forEach((f, i) => {
    const t = time(f)!, m = measures(f)[0].name;
    for (const r of f.rows) rows.set(r[t], { ...(rows.get(r[t]) ?? { time: r[t] }), [names[i]]: r[m] });
  });
  return [{
    title: firsts[0].title,
    fields: [{ name: "time", type: "time" }, ...names.map((name, i) => ({ name, type: "number" as const, unit: measures(firsts[i])[0].unit }))],
    rows: [...rows.values()].sort((a, b) => String(a.time).localeCompare(String(b.time))),
    prefer: ["line", "table"],
  }];
}

/** "List commits · iw4p / coldharbor": the tool's name plus the arguments that say what it's about. */
const NOISE_ARG = /page|limit|sort|order|direction|fields|method|format|cursor|after|before|since|until|detail|minimal|sha|ref/i;

/** Frames that only got the tool's name as a title (inferred from plain JSON) get a readable one: the arguments the user named. */
function titled(frames: Frame[], tool: ToolInfo, args: Args, message: string): Frame[] {
  const said = (v: string) => v.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length >= 3 && message.toLowerCase().includes(w));
  const about = Object.entries(args).filter(([k, v]) => typeof v === "string" && v.length <= 40 && !NOISE_ARG.test(k) && said(v)).map(([, v]) => v);
  const name = tool.title.charAt(0).toUpperCase() + tool.title.slice(1);
  // Generic tools ("Read query") say nothing about the result; the user's own question does.
  const q = message.trim().replace(/[?.!]+$/, "");
  const nice = about.length ? `${name} · ${about.join(" / ")}` : q && q.length <= 60 ? q.charAt(0).toUpperCase() + q.slice(1) : name;
  return frames.map((f) => (f.title === tool.name || f.title.startsWith(`${tool.name} · `) ? { ...f, title: f.title.replace(tool.name, nice) } : f));
}
