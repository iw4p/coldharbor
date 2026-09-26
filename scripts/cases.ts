/**
 * Labelled messages for routing evaluation.
 *
 * tool:   acceptable tool ids; "none" means no tool is named (a follow-up or off-topic),
 *         so the right move is to continue with the focused tile or to ask.
 * widget: acceptable explicit widget requests; "" means the user didn't ask for one.
 */
export interface Case {
  message: string;
  kind: "direct" | "follow-up" | "off-topic";
  tool: string[];
  widget: string[];
}

const G = "github.";
const W = "weather.forecast", S = "markets.stock_prices", C = "markets.crypto_prices", X = "markets.exchange_rates", N = "news.search_news";
const c = (kind: Case["kind"], message: string, tool: string | string[], widget: string | string[] = ""): Case =>
  ({ kind, message, tool: [tool].flat(), widget: [widget].flat() });

export const CASES: Case[] = [
  c("direct", "What's the weather in Berlin this week?", W),
  c("direct", "will it rain in London tomorrow?", W),
  c("direct", "how cold will it get in Oslo this weekend", W),
  c("direct", "weather in Berlin, Paris and Rome on a map", W, "map"),
  c("direct", "temperature in Tokyo for the next 10 days as a line chart", W, "line"),
  c("direct", "How has Apple stock done this year?", S, ["", "line"]),
  c("direct", "compare Tesla and Nvidia in a chart", S, ["line", "bar"]),
  c("direct", "MSFT share price over the last 5 days as a table", S, "table"),
  c("direct", "is Amazon stock up this month?", S),
  c("direct", "bitcoin price right now", C, ["", "stat"]),
  c("direct", "ETH vs SOL this month", C, ["", "line"]),
  c("direct", "how much is one dogecoin worth", C, ["", "stat"]),
  c("direct", "euro to dollar over the last 3 months as a table", X, "table"),
  c("direct", "EUR to GBP rate", X, ["", "stat"]),
  c("direct", "how many yen is one dollar", X, ["", "stat"]),
  c("direct", "latest news about electric cars", N, ["", "feed"]),
  c("direct", "what's happening with the elections in Brazil", N, ["", "feed"]),
  c("direct", "headlines on AI regulation", N, ["", "feed"]),
  c("direct", "any news about the earthquake in Japan", N, ["", "feed"]),
  c("direct", "bar chart of news about OpenAI by country", N, "bar"),
  // Cases for a GitHub MCP server (github-mcp-server). Only used when one is connected as "github".
  c("direct", "open pull requests in vercel/next.js", [G + "list_pull_requests", G + "search_pull_requests"]),
  c("direct", "latest commits on vercel/next.js", G + "list_commits"),
  c("direct", "show me the README of github/github-mcp-server", G + "get_file_contents"),
  c("direct", "find popular MCP server repositories", G + "search_repositories"),
  c("direct", "issues in facebook/react", [G + "list_issues", G + "search_issues"]),
  c("direct", "details of issue 99289 in vercel/next.js", G + "issue_read", ["", "detail"]),
  c("direct", "latest release of nodejs/node", [G + "get_latest_release", G + "list_releases"]),
  c("direct", "who am I on GitHub", G + "get_me"),
  c("direct", "branches of vercel/next.js", G + "list_branches"),
  c("direct", "search code for useEffect cleanup in facebook/react", G + "search_code"),
  c("follow-up", "yeah show it as a table", "none", "table"),
  c("follow-up", "bar chart please", "none", "bar"),
  c("follow-up", "show it on a map", "none", "map"),
  c("follow-up", "as a line graph", "none", "line"),
  c("follow-up", "just give me the number", "none", ["stat", ""]),
  c("follow-up", "what about Tehran?", ["none", W]),
  c("follow-up", "compare it with Nvidia", ["none", S]),
  c("follow-up", "and for the last year?", "none"),
  c("off-topic", "tell me a joke", "none"),
  c("off-topic", "what's the capital of France", "none"),
  c("off-topic", "write me a poem about the sea", "none"),
  c("off-topic", "hi", "none"),
];

/** A short conversation for the end-to-end run. `expect` is the tool and widget of the resulting tile, or "say"/"clarify". */
export const CONVERSATION: { message: string; expect: { tool?: string; widget?: string[]; outcome?: "say" | "clarify" } }[] = [
  { message: "What's the weather in Berlin this week?", expect: { tool: W, widget: ["line"] } },
  { message: "show it as a table", expect: { tool: W, widget: ["table"] } },
  { message: "what about Tehran?", expect: { tool: W, widget: ["table"] } },
  { message: "How has Apple stock done this year?", expect: { tool: S, widget: ["line"] } },
  { message: "compare it with Nvidia", expect: { tool: S, widget: ["line"] } },
  { message: "bar chart please", expect: { tool: S, widget: ["bar"] } },
  { message: "and for the last 5 days?", expect: { tool: S, widget: ["bar"] } },
  { message: "bitcoin price right now", expect: { tool: C, widget: ["stat", "line"] } },
  { message: "tell me a joke", expect: { outcome: "say" } },
];

/** Cases whose expected tools are all connected (so the set adapts to your config). */
export const casesFor = (toolIds: string[]) =>
  CASES.filter((c) => c.tool.every((t) => t === "none" || toolIds.includes(t)) || c.tool.some((t) => toolIds.includes(t)));
