/**
 * `pnpm probe`: check the config, every MCP server, System One and the LLM.
 * `pnpm probe <server> [tool] [json-args]`: see what a server offers, or call a tool and see the frames it becomes.
 *
 *   pnpm probe github
 *   pnpm probe github list_issues '{"owner":"x","repo":"y"}'
 */
import { loadConfig } from "../core/config.ts";
import { McpHub } from "../core/mcp.ts";
import { deps, state } from "../core/server.ts";
import { specs } from "../widgets/specs.ts";

const [server, tool, json] = process.argv.slice(2);
const { config, root, path } = loadConfig();

if (!server) {
  const d = deps(specs), { hub } = state();
  console.log(`config   ${path ?? "(none found, using defaults)"}`);
  const tools = await hub.list();
  for (const s of hub.serverStatus()) console.log(`${s.state === "ready" ? "✓" : "✗"} server  ${s.name.padEnd(12)} ${s.state === "ready" ? s.tools.join(", ") : s.error ?? s.state}`);
  console.log(`  ${tools.length} tools in total`);
  const t0 = Date.now();
  await d.s1.decide("weather in Berlin as a table", { table: "Does the message ask to see the data as a table?" })
    .then((a) => console.log(`✓ system one  ${d.s1.name} in ${Date.now() - t0} ms → table ${Math.round((a.table?.yes ?? 0) * 100)}%`), (e) => console.log(`✗ system one  ${d.s1.name}: ${e.message}`));
  const t1 = Date.now();
  await d.llm.json('Reply with JSON: {"ok": true}', "ping")
    .then((o) => console.log(`${(o as { ok?: boolean })?.ok ? "✓" : "✗"} llm     ${d.llm.name} in ${Date.now() - t1} ms`), (e) => console.log(`✗ llm     ${d.llm.name}: ${e.message}`));
  process.exit(0);
}
if (!config.mcpServers[server]) {
  console.log(`usage: pnpm probe [server] [tool] [json-args]\nservers: ${Object.keys(config.mcpServers).join(", ")}`);
  process.exit(1);
}
const hub = new McpHub({ [server]: config.mcpServers[server] }, root);
const client = await hub.client(server);

if (!tool) {
  const info = client.getServerVersion();
  console.log(`${info?.name} ${info?.version}\n${(client.getInstructions() ?? "").slice(0, 400)}\n`);
  const { tools } = await client.listTools();
  const count = (f: (t: (typeof tools)[number]) => unknown) => tools.filter(f).length;
  console.log(`${tools.length} tools · ${count((t) => t.annotations?.readOnlyHint)} marked read-only · ${count((t) => t.annotations?.destructiveHint)} destructive · ${count((t) => !t.annotations)} without annotations\n`);
  for (const t of tools) {
    const { properties = {}, required = [] } = t.inputSchema as { properties?: object; required?: string[] };
    const flags = [t.annotations?.readOnlyHint && "ro", t.annotations?.destructiveHint && "DESTRUCTIVE", t.outputSchema && "out"].filter(Boolean).join(",");
    console.log(`${t.name.padEnd(34)} ${flags.padEnd(8)} ${Object.keys(properties).map((p) => (required.includes(p) ? p + "*" : p)).join(" ").slice(0, 70)}`);
    console.log(`${"".padEnd(43)} ${(t.description ?? "").replace(/\s+/g, " ").slice(0, 110)}`);
  }
} else {
  const t0 = Date.now();
  const res = await client.callTool({ name: tool, arguments: JSON.parse(json ?? "{}") });
  const text = ((res.content as { type: string; text?: string }[]) ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  console.log(`${tool} in ${Date.now() - t0} ms · isError=${!!res.isError} · structuredContent=${!!res.structuredContent} · text ${text.length} chars`);
  console.log(`raw (first 1500 chars):\n${text.slice(0, 1500)}\n`);
  // Frames exactly as the app gets them.
  for (const f of await hub.call(`${server}.${tool}`, JSON.parse(json ?? "{}"))) {
    console.log(`frame "${f.title}" · ${f.rows.length} rows · label=${f.labelField ?? "-"} · prefer=${f.prefer?.join("/") ?? "-"}`);
    console.log(`  fields: ${f.fields.map((x) => `${x.name}:${x.type}`).join(", ")}`);
    console.log(`  row 0: ${JSON.stringify(f.rows[0]).slice(0, 400)}`);
  }
}
await hub.close();
process.exit(0);
