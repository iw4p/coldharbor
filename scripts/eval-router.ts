/**
 * `pnpm eval-router`: how well does the router pick the right tool and widget?
 * Uses the tools of the MCP servers in glance.config.json and the web app's widget specs.
 */
import { glance, THRESHOLDS } from "../packages/core/src/server.ts";
import { specs } from "../apps/web/widgets/specs.ts";

// [message, expected tool id (or "none"), explicitly asked widget or ""]
const CASES: [string, string, string][] = [
  ["What's the weather in Berlin this week?", "weather.forecast", ""],
  ["will it rain in London tomorrow?", "weather.forecast", ""],
  ["weather in Berlin, Paris and Rome on a map", "weather.forecast", "map"],
  ["How has Apple stock done this year?", "markets.stock_prices", ""],
  ["compare Tesla and Nvidia in a chart", "markets.stock_prices", "line"],
  ["bitcoin price right now", "markets.crypto_prices", "stat"],
  ["ETH vs SOL this month", "markets.crypto_prices", ""],
  ["euro to dollar over the last 3 months as a table", "markets.exchange_rates", "table"],
  ["EUR to GBP rate", "markets.exchange_rates", ""],
  ["latest news about electric cars", "news.search_news", ""],
  ["what's happening with the elections in Brazil", "news.search_news", ""],
  ["headlines on AI regulation", "news.search_news", "feed"],
  ["tell me a joke", "none", ""],
  ["yeah show it as a table", "none", "table"],
  ["bar chart please", "none", "bar"],
  ["show it on a map", "none", "map"],
];

const g = glance();
const tools = await g.hub.list();
let toolOk = 0, widgetOk = 0, ms = 0;
for (const [msg, want, widget] of CASES) {
  const d = await g.router.route(msg, tools, specs);
  ms += d.ms;
  const got = d.tools[0].p >= THRESHOLDS.tool ? d.tools[0].id : "none";
  const [gw, gp] = Object.entries(d.widgets).sort((a, b) => b[1] - a[1])[0];
  const gotWidget = gp >= THRESHOLDS.viewOnly ? gw : "";
  toolOk += +(got === want);
  widgetOk += +(gotWidget === widget);
  console.log(`${got === want ? "✓" : "✗"}${gotWidget === widget ? "✓" : "✗"} ${msg.padEnd(50)} ${d.tools[0].id} ${Math.round(d.tools[0].p * 100)}% · none ${Math.round(d.none * 100)}% · ${gw} ${Math.round(gp * 100)}%`);
}
console.log(`\ntool ${toolOk}/${CASES.length} · widget ${widgetOk}/${CASES.length} · ${Math.round(ms / CASES.length)} ms avg (${g.router.name})`);
await g.hub.close();
process.exit(0);
