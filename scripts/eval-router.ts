/**
 * `pnpm eval-router`: how well does the router pick the right tool and widget?
 * Uses the tools of the MCP servers in coldharbor.config.json and the web app's widget specs.
 */
import { coldharbor, THRESHOLDS } from "../packages/core/src/server.ts";
import { specs } from "../apps/web/widgets/specs.ts";

import { casesFor } from "./cases.ts";

const g = coldharbor();
const tools = await g.hub.list();
const CASES = casesFor(tools.map((t) => t.id));
let toolOk = 0, widgetOk = 0, ms = 0;
for (const { message: msg, tool: want, widget } of CASES) {
  const d = await g.router.route(msg, tools, specs);
  ms += d.ms;
  const got = (d.tools[0]?.p ?? 0) >= THRESHOLDS.tool ? d.tools[0].id : "none";
  const [gw, gp] = Object.entries(d.widgets).sort((a, b) => b[1] - a[1])[0];
  const gotWidget = gp >= THRESHOLDS.viewOnly ? gw : "";
  toolOk += +want.includes(got);
  widgetOk += +widget.includes(gotWidget);
  console.log(`${want.includes(got) ? "✓" : "✗"}${widget.includes(gotWidget) ? "✓" : "✗"} ${msg.padEnd(50)} ${d.tools[0]?.id ?? "-"} ${Math.round((d.tools[0]?.p ?? 0) * 100)}% · none ${Math.round(d.none * 100)}% · ${gw} ${Math.round(gp * 100)}%`);
}
console.log(`\ntool ${toolOk}/${CASES.length} · widget ${widgetOk}/${CASES.length} · ${Math.round(ms / CASES.length)} ms avg (${g.router.name})`);
await g.hub.close();
process.exit(0);
