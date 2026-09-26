/**
 * `pnpm probe <server> [tool] [json-args]`: see what an MCP server offers and what ColdHarbor makes of it.
 *
 *   pnpm probe github                                  list tools, annotations, arguments
 *   pnpm probe github list_issues '{"owner":"x","repo":"y"}'   call a tool: raw result + the frames it becomes
 */
import { loadConfig, McpHub } from "../packages/core/src/server.ts";

const [server, tool, json] = process.argv.slice(2);
const { config, root } = loadConfig();
if (!server || !config.mcpServers[server]) {
  console.log(`usage: pnpm probe <server> [tool] [json-args]\nservers: ${Object.keys(config.mcpServers).join(", ")}`);
  process.exit(1);
}
const hub = new McpHub({ [server]: config.mcpServers[server] }, root);
const client = await hub.client(server);

if (!tool) {
  const info = client.getServerVersion();
  console.log(`${info?.name} ${info?.version}\n${(client.getInstructions() ?? "").slice(0, 400)}\n`);
  const { tools } = await client.listTools();
  const ro = tools.filter((t) => t.annotations?.readOnlyHint).length;
  console.log(`${tools.length} tools · ${ro} marked read-only · ${tools.filter((t) => t.annotations?.destructiveHint).length} destructive · ${tools.filter((t) => !t.annotations).length} without annotations\n`);
  for (const t of tools) {
    const props = Object.keys((t.inputSchema as { properties?: object }).properties ?? {});
    const req = (t.inputSchema as { required?: string[] }).required ?? [];
    const flags = [t.annotations?.readOnlyHint && "ro", t.annotations?.destructiveHint && "DESTRUCTIVE", t.outputSchema && "out"].filter(Boolean).join(",");
    console.log(`${t.name.padEnd(34)} ${flags.padEnd(8)} ${props.map((p) => (req.includes(p) ? p + "*" : p)).join(" ").slice(0, 70)}`);
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
