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
const W = "weather.weather_forecast", WA = "weather.weather_archive", AQ = "weather.air_quality";
const P = "crypto.coingecko_get_prices", CH = "crypto.coingecko_get_market_chart", TR = "crypto.coingecko_get_trending", MK = "crypto.coingecko_list_markets", GL = "crypto.coingecko_get_global";
const H = "hackernews.", E = "earthquakes.", WB = "worldbank.", AX = "arxiv.";
const c = (kind: Case["kind"], message: string, tool: string | string[], widget: string | string[] = ""): Case =>
  ({ kind, message, tool: [tool].flat(), widget: [widget].flat() });

export const CASES: Case[] = [
  c("direct", "What's the weather in Berlin this week?", W),
  c("direct", "will it rain in London tomorrow?", W),
  c("direct", "how cold will it get in Oslo this weekend", W),
  c("direct", "temperature in Tokyo for the next 10 days as a line chart", W, "line"),
  c("direct", "weather in Paris as a table", W, "table"),
  c("direct", "how warm was it in Rome last month?", [WA, W], ["", "line"]),
  c("direct", "air quality in Delhi today", AQ),
  c("direct", "bitcoin price right now", P, ["", "stat"]),
  c("direct", "how much is one dogecoin worth", P, ["", "stat"]),
  c("direct", "bitcoin price over the last 30 days", CH, ["", "line"]),
  c("direct", "which coins are trending right now?", TR, ["", "table"]),
  c("direct", "top 10 cryptocurrencies by market cap", MK, ["", "table"]),
  c("direct", "how big is the whole crypto market?", [GL, MK], ["", "stat"]),
  c("direct", "top stories on Hacker News", H + "getTopStories", ["", "feed"]),
  c("direct", "latest Show HN posts", H + "getShowHNStories", ["", "feed"]),
  c("direct", "what are people asking on Ask HN?", H + "getAskHNStories", ["", "feed"]),
  c("direct", "newest Hacker News submissions", H + "getNewStories", ["", "feed"]),
  c("direct", "Hacker News job postings", H + "getJobStories", ["", "feed"]),
  c("direct", "best Hacker News stories as a table", H + "getBestStories", "table"),
  c("direct", "bar chart of the top Hacker News stories by score", H + "getTopStories", "bar"),
  c("direct", "big earthquakes this week", [E + "earthquake_get_feed", E + "earthquake_search"], ["", "map"]),
  c("direct", "earthquakes near Tokyo this month on a map", E + "earthquake_search", "map"),
  c("direct", "GDP of Germany since 2000", WB + "get-economic-data", ["", "line"]),
  c("direct", "life expectancy in Japan", [WB + "get-health-data", WB + "get-social-data"], ["", "line"]),
  c("direct", "latest papers on small language models", AX + "arxiv_search", ["", "feed"]),
  c("direct", "find arXiv papers about diffusion models", AX + "arxiv_search", ["", "feed"]),
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
  c("follow-up", "compare it with ethereum", ["none", P, CH]),
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
  { message: "bitcoin price right now", expect: { tool: P, widget: ["stat", "table"] } },
  { message: "and ethereum?", expect: { tool: P, widget: ["stat", "table"] } },
  { message: "bitcoin price over the last 30 days", expect: { tool: CH, widget: ["line"] } },
  { message: "top stories on Hacker News", expect: { tool: H + "getTopStories", widget: ["feed"] } },
  { message: "as a table", expect: { tool: H + "getTopStories", widget: ["table"] } },
  { message: "tell me a joke", expect: { outcome: "say" } },
];

/** Cases whose expected tools are all connected (so the set adapts to your config). */
export const casesFor = (toolIds: string[]) =>
  CASES.filter((c) => c.tool.every((t) => t === "none" || toolIds.includes(t)) || c.tool.some((t) => toolIds.includes(t)));
