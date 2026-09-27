/**
 * The server side: config, MCP hub, System One and the LLM wired together, plus the canvas and the
 * intents that change it. The canvas is saved next to the config, so it survives restarts.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { apply, type Canvas, type Edit, type Intent } from "./canvas.ts";
import { loadConfig } from "./config.ts";
import { ask, run, type Deps } from "./engine.ts";
import type { WidgetSpec } from "./frame.ts";
import { createLLM } from "./llm.ts";
import { McpHub } from "./mcp.ts";
import { kev, llmDecider } from "./systemone.ts";
import type { EngineEvent, Tile } from "./types.ts";

type State = { hub: McpHub; canvas: Canvas; file: string };

// The hub and the canvas live as long as the process (and across hot reloads), so servers aren't respawned.
// Everything else, the config included, is rebuilt per request, so edits apply immediately.
const g = globalThis as { __coldharbor?: State };
export function state(): State {
  if (g.__coldharbor) return g.__coldharbor;
  const { config, root } = loadConfig(), file = join(root, ".coldharbor", "canvas.json");
  let canvas: Canvas = { runs: [], tiles: [] };
  try {
    canvas = JSON.parse(readFileSync(file, "utf8"));
  } catch {}
  return (g.__coldharbor = { file, canvas, hub: new McpHub(config.mcpServers, root) });
}

export function deps(widgets: WidgetSpec[]): Deps {
  const { config } = loadConfig(), llm = createLLM(config.llm), r = config.router;
  return { s1: r.type === "llm" ? llmDecider(llm) : kev(r), second: r.type === "hybrid" ? llmDecider(llm) : undefined, llm, tools: state().hub, widgets };
}

export const canvas = () => state().canvas;

/** Applies an intent: streams the edits it makes, and saves the canvas when done. */
export async function* handle(intent: Intent, widgets: WidgetSpec[]): AsyncGenerator<Edit> {
  const s = state();
  try {
    for await (const e of edits(intent, s, deps(widgets))) {
      s.canvas = apply(s.canvas, e);
      yield e;
    }
  } finally {
    mkdirSync(join(s.file, ".."), { recursive: true });
    writeFileSync(s.file, JSON.stringify(s.canvas));
  }
}

async function* edits(i: Intent, s: State, d: Deps): AsyncGenerator<Edit> {
  const tile = (id?: string) => s.canvas.tiles.find((t) => t.id === id);
  // What the canvas already established (owner, repo, city…): newer tiles win, the focused tile most.
  const known = (focus?: Tile) => Object.assign({}, ...s.canvas.tiles.toReversed().map((t) => t.args), focus?.args);
  const start = async function* (message: string, events: AsyncIterable<EngineEvent>, run = crypto.randomUUID()): AsyncGenerator<Edit> {
    if (!s.canvas.runs.some((r) => r.id === run)) yield { run, message };
    try {
      for await (const event of events) yield { run, event };
    } catch (err) {
      yield { run, event: { type: "error", message: (err as Error).message } };
    }
  };

  if ("ask" in i) return yield* start(i.ask, ask({ message: i.ask, focus: tile(i.focus), known: known(tile(i.focus)) }, d));
  if ("refresh" in i) {
    const t = tile(i.refresh);
    if (t) yield* start(`Refresh “${t.title}”`, run({ toolId: t.toolId, args: t.args }, d, t.title, t));
    return;
  }
  if (!("run" in i)) return yield i;
  // A run only takes an answer to the question it is showing: "which one?", or "run this?".
  const r = s.canvas.runs.find((x) => x.id === i.run), last = r?.events.at(-1);
  if (!r || !last) return;
  if ("choose" in i) {
    if (last.type === "clarify") yield* start(r.message, ask({ message: r.message, tool: i.choose, focus: tile(i.focus), known: known(tile(i.focus)) }, d), r.id);
    return;
  }
  if (last.type !== "confirm" && last.type !== "needs-input") return;
  if ("cancel" in i) return yield { run: r.id, event: { type: "say", text: "Cancelled. Nothing was run." } };
  // Answered right away, before anything is awaited, so the same approval can't run the call twice.
  yield { run: r.id, event: { type: "step", step: { who: "you", text: last.type === "confirm" ? "approved" : "filled in the details" } } };
  // Only the call this run proposed; the user's values only for the fields it asked for.
  const values = last.type === "needs-input" ? Object.fromEntries(last.fields.map((f) => [f.name, i.approve[f.name]])) : {};
  yield* start(r.message, run({ ...last.call, args: { ...last.call.args, ...values } }, d, r.message), r.id);
}

/** Everything connected: MCP servers and their tools, widgets, and whether System One and the LLM are up. */
export async function catalog(widgets: WidgetSpec[]) {
  const s = state(), d = deps(widgets), { config: { router, llm }, path } = loadConfig();
  const up = (url: string) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
  const tools = await s.hub.list();
  return {
    configPath: path,
    servers: s.hub.serverStatus(),
    tools: tools.map(({ id, server, name, title, description, readOnly, autoRun }) => ({ id, server, name, title, description, readOnly, autoRun })),
    widgets: widgets.map(({ id, name, ask }) => ({ id, name, ask })),
    router: { name: d.second ? `${d.s1.name} + ${d.second.name}` : d.s1.name, up: router.type === "llm" || (await up(`${router.baseUrl}/v1/models`)) },
    llm: { name: `${llm.model} (${llm.provider})`, up: llm.provider !== "ollama" || (await up(`${llm.baseUrl ?? "http://127.0.0.1:11434"}/api/tags`)) },
  };
}
export type Catalog = Awaited<ReturnType<typeof catalog>>;
