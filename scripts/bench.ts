/**
 * `pnpm bench [before|kev|hybrid]`: who answers System One's questions, and what it does to accuracy and time.
 *
 *   before  the LLM answers them (which tool, which view, is it a follow-up?), then fills in the arguments
 *   kev     Kev answers them; the LLM only fills in arguments, and is skipped when a message only changes the view
 *   hybrid  Kev answers them, and the LLM chooses from Kev's shortlist when Kev is unsure which tool is meant
 *
 * Everything else (the questions, engine, thresholds, MCP sources, widgets, LLM) is identical.
 * Writes docs/benchmark.md and docs/benchmark.json next to the config.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { loadConfig } from "../core/config.ts";
import { ask } from "../core/engine.ts";
import { createLLM } from "../core/llm.ts";
import { McpHub } from "../core/mcp.ts";
import { route, THRESHOLDS, type Route } from "../core/route.ts";
import { kev, llmDecider, type SystemOne } from "../core/systemone.ts";
import type { LLM, Tile } from "../core/types.ts";
import { specs } from "../widgets/specs.ts";
import { casesFor, CONVERSATION, type Case } from "./cases.ts";

const { config, root } = loadConfig();
const kevUrl = config.router.type !== "llm" ? config.router.baseUrl : "http://127.0.0.1:8009";
const hub = new McpHub(config.mcpServers, root);
const tools = await hub.list();
const CASES = casesFor(tools.map((t) => t.id));

// Count every LLM call, whoever makes it.
const base = createLLM(config.llm);
let llmCalls = 0;
const llm: LLM = { name: base.name, json: (s, u) => (llmCalls++, base.json(s, u)) };
const K = kev({ baseUrl: kevUrl }), L = llmDecider(llm);

const variants: { key: string; label: string; s1: SystemOne; second?: SystemOne }[] = [
  { key: "before", label: `Before: ${base.name} answers`, s1: L },
  { key: "kev", label: "Kev answers", s1: K },
  { key: "hybrid", label: `Kev + ${base.name} when unsure`, s1: K, second: L },
].filter((v) => !process.argv[2] || v.key === process.argv[2]);

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] ?? 0;
const secs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

function decide(d: Route) {
  const tool = d.tools[0] && d.tools[0].p >= THRESHOLDS.tool ? d.tools[0].id : "none";
  const [w, wp] = Object.entries(d.widgets).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  return { tool, toolP: d.tools[0]?.p ?? 0, widget: wp >= THRESHOLDS.viewOnly ? w : "", escalated: d.by.includes("→") };
}

// ── 1 · Routing on labelled messages ────────────────────────────────────────────
type Row = ReturnType<typeof decide> & { ms: number; toolOk: boolean; widgetOk: boolean; confidentlyWrong: boolean };
const routing: Record<string, Row[]> = {};
for (const v of variants) {
  process.stdout.write(`\n${v.label}: routing ${CASES.length} messages `);
  await route("warm up", tools, specs, v.s1, v.second); // load models; not timed
  routing[v.key] = [];
  for (const c of CASES) {
    const t0 = performance.now();
    const r = decide(await route(c.message, tools, specs, v.s1, v.second));
    const ms = performance.now() - t0;
    const toolOk = c.tool.includes(r.tool);
    // Acting on the wrong source fetches wrong data. Deferring ("none") only means the UI asks.
    routing[v.key].push({ ...r, ms, toolOk, widgetOk: c.widget.includes(r.widget), confidentlyWrong: r.tool !== "none" && !toolOk });
    process.stdout.write(toolOk ? "." : "x");
  }
}

// ── 2 · End-to-end conversation through the real engine and MCP sources ─────────
type Turn = { ms: number; llm: number; result: string; ok: boolean };
const convo: Record<string, Turn[]> = {};
for (const v of variants) {
  process.stdout.write(`\n${v.label}: conversation `);
  convo[v.key] = [];
  let focus: Tile | undefined;
  for (const turn of CONVERSATION) {
    const calls0 = llmCalls, t0 = performance.now();
    let result = "", tool: string | undefined, widget: string | undefined, outcome = "";
    try {
      for await (const e of ask({ message: turn.message, focus }, { s1: v.s1, second: v.second, llm, tools: hub, widgets: specs })) {
        if (e.type === "tile") {
          focus = e.tile;
          [tool, widget, outcome] = [e.tile.toolId, e.tile.widget, "tile"];
          result = `${e.tile.toolId.split(".")[1]} → ${e.tile.widget} ${JSON.stringify(e.tile.args)}`;
        } else if (e.type === "say" || e.type === "clarify" || e.type === "error") {
          outcome = e.type;
          result = e.type === "clarify" ? `asked: ${e.options.slice(0, 2).map((o) => o.toolId).join(" / ")}…` : e.type === "say" ? "said: not a data request" : `error: ${e.message}`;
        }
      }
    } catch (err) {
      [outcome, result] = ["error", `error: ${(err as Error).message}`];
    }
    const x = turn.expect;
    const ok = x.outcome ? outcome === x.outcome : outcome === "tile" && tool === x.tool && !!widget && !!x.widget?.includes(widget);
    convo[v.key].push({ ms: performance.now() - t0, llm: llmCalls - calls0, result, ok });
    process.stdout.write(ok ? "." : "x");
  }
}
await hub.close();

// ── Report ──────────────────────────────────────────────────────────────────────
const kevInfo = await fetch(`${kevUrl}/v1/models`).then((r) => r.json()).then((j) => j.models?.[0]).catch(() => null);
const S = Object.fromEntries(variants.map((v) => {
  const rows = routing[v.key], turns = convo[v.key];
  const ms = rows.map((r) => r.ms);
  return [v.key, {
    n: rows.length,
    tool: rows.filter((r) => r.toolOk).length,
    widget: rows.filter((r) => r.widgetOk).length,
    both: rows.filter((r) => r.toolOk && r.widgetOk).length,
    confidentlyWrong: rows.filter((r) => r.confidentlyWrong).length,
    escalated: rows.filter((r) => r.escalated).length,
    byKind: Object.fromEntries((["direct", "follow-up", "off-topic"] as const).map((k) => {
      const rs = rows.filter((_, i) => CASES[i].kind === k);
      return [k, `${rs.filter((r) => r.toolOk && r.widgetOk).length}/${rs.length}`];
    })),
    p50: q(ms, 0.5), p95: q(ms, 0.95), mean: ms.reduce((a, b) => a + b, 0) / ms.length,
    convoOk: turns.filter((t) => t.ok).length, convoN: turns.length,
    convoMs: turns.reduce((a, t) => a + t.ms, 0), convoLlm: turns.reduce((a, t) => a + t.llm, 0),
  }];
}));
const keys = variants.map((v) => v.key);
const row = (label: string, f: (s: (typeof S)[string]) => string) => `| ${label} | ${keys.map((k) => f(S[k])).join(" | ")} |`;
const speedup = (k: string, field: "p50" | "convoMs") => (k === "before" || !S.before ? "" : ` (${(S.before[field] / S[k][field]).toFixed(1)}× faster)`);

const md = `# Benchmark: routing with and without Kev (System One)

ColdHarbor turns a message into *which tool* and *which widget*, then an LLM fills in the tool's arguments. This compares three ways to answer those quick questions:

- **Before:** ${base.name} (a local ${config.llm.model} via ${config.llm.provider}) answers the quick questions for every message: which tool, which view, is it a follow-up, did it make a value up?
- **Kev:** [Kev](https://github.com/jaredpalmer/kev)'s System One model answers them; ${base.name} only fills in arguments, and is skipped when a message only changes the view.
- **Kev + ${base.name} (hybrid, the default):** Kev answers them, and ${base.name} chooses from Kev's shortlist only when Kev is unsure which tool is meant. View requests always come from Kev.

All three get exactly the same questions, with the same options.

Everything else is identical: the engine, the thresholds (act on a tool at ≥ ${THRESHOLDS.tool * 100}%, treat a view request as explicit at ≥ ${THRESHOLDS.viewOnly * 100}%), the MCP sources and the widgets.

Run on ${new Date().toISOString().slice(0, 10)} · ${os.cpus()[0]?.model ?? os.arch()} · ${Math.round(os.totalmem() / 2 ** 30)} GB RAM · Kev \`${kevInfo?.run ?? "?"}\` (${kevInfo?.backend ?? "?"} ${kevInfo?.dtype ?? ""}) · ${tools.length} tools from ${new Set(tools.map((t) => t.server)).size} MCP servers · ${specs.length} widgets.
Reproduce with \`pnpm bench\` (needs Kev on ${kevUrl} and the LLM running). Raw numbers: \`docs/benchmark.json\`.

## Summary

| | ${variants.map((v) => v.label).join(" | ")} |
|---|${keys.map(() => "---").join("|")}|
${row("**Routing: tool and view both right**", (s) => `**${s.both}/${s.n} (${pct(s.both, s.n)})**`)}
${row("Routing: right tool", (s) => `${s.tool}/${s.n} (${pct(s.tool, s.n)})`)}
${row("Routing: right view request", (s) => `${s.widget}/${s.n} (${pct(s.widget, s.n)})`)}
${row("Confidently wrong (fetched the wrong source)", (s) => String(s.confidentlyWrong))}
| **Routing time, median** | ${keys.map((k) => `**${secs(S[k].p50)}**${speedup(k, "p50")}`).join(" | ")} |
${row("Routing time, p95", (s) => secs(s.p95))}
${row("Messages sent to the LLM for routing", (s) => (s === S.before ? `${s.n}/${s.n}` : `${s.escalated}/${s.n}`))}
| **Conversation (${CONVERSATION.length} turns): right** | ${keys.map((k) => `**${S[k].convoOk}/${S[k].convoN}**`).join(" | ")} |
| **Conversation: total time** | ${keys.map((k) => `**${secs(S[k].convoMs)}**${speedup(k, "convoMs")}`).join(" | ")} |
${row("Conversation: LLM calls", (s) => String(s.convoLlm))}

"Confidently wrong" is the error that matters most: System One was sure enough to act, and ColdHarbor fetched and drew the wrong data.
When it isn't sure, ColdHarbor asks you instead, which costs a click, not a wrong answer.

## By kind of message (tool and view both right)

| Kind | ${variants.map((v) => v.label).join(" | ")} |
|---|${keys.map(() => "---").join("|")}|
${(["direct", "follow-up", "off-topic"] as const).map((k) => `| ${k} (${CASES.filter((c) => c.kind === k).length}) | ${keys.map((x) => S[x].byKind[k]).join(" | ")} |`).join("\n")}

## Every routing decision

✓ right · ✗ wrong but safe (ColdHarbor asks, or keeps the current tile) · ✗✗ confidently wrong · ↗ escalated to ${base.name}

| Message | Expected | ${variants.map((v) => v.label).join(" | ")} |
|---|---|${keys.map(() => "---").join("|")}|
${CASES.map((c: Case, i) => {
  const cell = (r: Row) => `${r.toolOk && r.widgetOk ? "✓" : r.confidentlyWrong ? "✗✗" : "✗"}${r.escalated ? " ↗" : ""} ${r.tool === "none" ? "none" : r.tool.split(".")[1]}${r.tool !== "none" ? ` ${Math.round(r.toolP * 100)}%` : ""}${r.widget ? ` · ${r.widget}` : ""} · ${secs(r.ms)}`;
  return `| ${c.message} | ${c.tool.map((t) => t.split(".").pop()).join(" / ")}${c.widget.some(Boolean) ? ` · ${c.widget.filter(Boolean).join("/")}` : ""} | ${keys.map((k) => cell(routing[k][i])).join(" | ")} |`;
}).join("\n")}

## End-to-end conversation

The same ${CONVERSATION.length} messages in a row through the real engine and MCP sources, with follow-ups referring to the previous tile.

| # | Message | ${variants.map((v) => v.label).join(" | ")} |
|---|---|${keys.map(() => "---").join("|")}|
${CONVERSATION.map((t, i) => {
  const cell = (x: Turn) => `${x.ok ? "✓" : "✗"} ${secs(x.ms)} · ${x.llm} LLM<br><sub>${x.result.replace(/\|/g, "/")}</sub>`;
  return `| ${i + 1} | ${t.message} | ${keys.map((k) => cell(convo[k][i])).join(" | ")} |`;
}).join("\n")}
| | **Total** | ${keys.map((k) => `**${secs(S[k].convoMs)} · ${S[k].convoLlm} LLM calls**`).join(" | ")} |

## Method

- ${CASES.length} hand-labelled messages (\`scripts/cases.ts\`): ${CASES.filter((c) => c.kind === "direct").length} direct requests across ${tools.length} tools, ${CASES.filter((c) => c.kind === "follow-up").length} follow-ups that only make sense with a previous tile, ${CASES.filter((c) => c.kind === "off-topic").length} off-topic messages. Some accept more than one answer (e.g. "compare it with Nvidia" may name the stock tool or defer to the current tile).
- Each variant is warmed up once (model loading not timed), then routes every message once. Both models run at temperature 0.
- The LLM's confidence is self-reported; Kev's is a calibrated probability.
- Wall-clock times on one machine with both models loaded. The conversation includes real API calls (Open-Meteo, Yahoo Finance, CoinGecko), identical for every variant.
- Small test set: treat differences of one or two messages as noise.
`;

const dir = join(root, "docs");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "benchmark.md"), md);
writeFileSync(join(dir, "benchmark.json"), JSON.stringify({ date: new Date().toISOString(), llm: config.llm, kev: kevInfo?.run, summary: S, cases: CASES, routing, conversation: CONVERSATION, convo }, null, 2));
console.log(`\n\n${md.split("## By kind")[0]}\nWrote docs/benchmark.md and docs/benchmark.json`);
process.exit(0);
