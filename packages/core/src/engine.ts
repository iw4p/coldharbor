import type { Frame } from "./frame.ts";
import type { Args, EngineEvent, Focus, LLM, Router, Tile, ToolInfo, ToolRunner, TraceStep, WidgetSpec } from "./types.ts";

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
}

/** How sure the router must be before we act without asking. */
export const THRESHOLDS = {
  tool: 0.55,
  /** Pick a widget the user asked for. */
  widget: 0.6,
  /** Stricter: treat the message as "only change the view" and skip the LLM and the data call. */
  viewOnly: 0.75,
  viewOnlySubject: 0.3,
  offTopic: 0.85,
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
    yield { type: "error", message: "No tools are connected. Add an MCP server to glance.config.json." };
    return;
  }

  // 1 · Route
  const r = await deps.router.route(message, tools, deps.widgets);
  const [askedWidget, askedP] = top(r.widgets);
  const best = r.tools[0];
  yield step(r.by, `tool ${r.tools.slice(0, 3).map((t) => `${t.id} ${pct(t.p)}`).join(" · ")}` +
    (askedP >= 0.5 ? ` · asked for ${askedWidget} ${pct(askedP)}` : "") + ` · new subject ${pct(r.newSubject)}`, r.ms);

  if (!forceTool && focus && r.none > THRESHOLDS.offTopic && askedP < THRESHOLDS.viewOnly && r.newSubject < 0.5) {
    yield { type: "say", text: `That doesn't look like something your sources can answer (${pct(r.none)} sure). Your canvas stays as it is.` };
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
  const tool = tools.find((t) => t.id === toolId);
  if (!tool) {
    yield { type: "error", message: `Unknown tool ${toolId}` };
    return;
  }

  // 2 · Data: reuse, or fill arguments and call the tool
  const same = focus?.toolId === toolId;
  let args: Args;
  let frames: Frame[];
  let reused = false;
  if (same && r.newSubject < THRESHOLDS.viewOnlySubject && askedP >= THRESHOLDS.viewOnly) {
    ({ args, frames } = focus!);
    reused = true;
    yield step("engine", "only a view change, so no LLM call and no new data");
  } else {
    const t0 = Date.now();
    args = await fillArgs(deps.llm, tool, message, same ? focus!.args : undefined);
    yield step(deps.llm.name, JSON.stringify(args), Date.now() - t0);
    if (same && sameArgs(args, focus!.args)) {
      frames = focus!.frames;
      reused = true;
      yield step("engine", "nothing new to fetch, reusing the data");
    } else {
      const t1 = Date.now();
      frames = await deps.tools.call(toolId, args);
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

async function fillArgs(llm: LLM, tool: ToolInfo, message: string, previous?: Args): Promise<Args> {
  const props = tool.inputSchema.properties ?? {};
  if (!Object.keys(props).length) return {};
  const system =
    `You fill in the arguments for the tool "${tool.title}": ${tool.description}\n` +
    `The arguments must match this JSON Schema:\n${JSON.stringify(tool.inputSchema)}\n` +
    `Reply with the arguments as a JSON object and nothing else. If the message doesn't mention a value, keep the previous value or use a sensible default. ` +
    `"what about X?", "and in X?" or "now X" means replace the previous value with X. ` +
    `"compare with X", "X vs Y", "X and Y" or "add X" means include both.`;
  const user = `Previous arguments: ${previous ? JSON.stringify(previous) : "none"}\nMessage: ${message}`;
  const out = (await llm.json(system, user)) as Args;
  const args: Args = { ...(previous ?? {}) };
  for (const k of Object.keys(props)) if (out?.[k] !== undefined && out[k] !== null) args[k] = out[k];
  return args;
}

function sameArgs(a: Args, b: Args) {
  const norm = (x: Args) => JSON.stringify(Object.keys(x).sort().map((k) => [k, x[k]]));
  return norm(a) === norm(b);
}
