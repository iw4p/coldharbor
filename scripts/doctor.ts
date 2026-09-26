/**
 * `pnpm doctor`: checks the config, connects to every MCP server, lists their tools,
 * and pings the router and the LLM. Pass a tool id and JSON args to try a call:
 *
 *   pnpm doctor weather.forecast '{"cities":["Berlin"]}'
 */
import { coldharbor } from "../packages/core/src/server.ts";

const g = coldharbor();
const ok = (b: boolean) => (b ? "✓" : "✗");
console.log(`config   ${g.configPath ?? "(none found, using defaults)"}`);

const tools = await g.hub.list();
for (const s of g.hub.serverStatus()) {
  console.log(`${ok(s.state === "ready")} server  ${s.name.padEnd(12)} ${s.state === "ready" ? s.tools.join(", ") : s.error ?? s.state}`);
}
console.log(`  ${tools.length} tools in total`);

try {
  const d = await g.router.route("weather in Berlin as a table", tools, [{ id: "table", name: "Table", ask: "Does the message ask to see the data as a table?", score: () => 1 }]);
  console.log(`✓ router  ${g.router.name} in ${d.ms} ms → ${d.tools[0]?.id} ${Math.round((d.tools[0]?.p ?? 0) * 100)}%, table ${Math.round(d.widgets.table * 100)}%`);
} catch (e) {
  console.log(`✗ router  ${g.router.name}: ${(e as Error).message}`);
}
try {
  const t0 = Date.now();
  const out = await g.llm.json('Reply with JSON: {"ok": true}', "ping");
  console.log(`${ok((out as { ok?: boolean })?.ok === true)} llm     ${g.llm.name} in ${Date.now() - t0} ms`);
} catch (e) {
  console.log(`✗ llm     ${g.llm.name}: ${(e as Error).message}`);
}

const [toolId, json] = process.argv.slice(2);
if (toolId) {
  const t0 = Date.now();
  const frames = await g.hub.call(toolId, JSON.parse(json ?? "{}"));
  console.log(`\n${toolId} in ${Date.now() - t0} ms:`);
  for (const f of frames) console.log(`  · ${f.title} — ${f.fields.map((x) => `${x.name}:${x.type}`).join(", ")} — ${f.rows.length} rows`);
}
await g.hub.close();
process.exit(0);
