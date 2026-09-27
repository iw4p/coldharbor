# ColdHarbor

**Connect any MCP server. Ask in plain words. Watch live widgets appear.**

![ColdHarbor: five tiles from four MCP servers (GitHub pull requests, a README, stock charts, a weather map), made from plain questions in the chat on the left](docs/screenshots/canvas.png)

ColdHarbor is a proof of two ideas:

1. **Let a tiny "System One" classifier make the quick choices, and the LLM only the ones that need language.**
   A 0.8B model ([Kev](https://github.com/jaredpalmer/kev)) decides which tool, which view, and whether a message is a
   follow-up; a small local LLM fills in arguments, or picks from Kev's shortlist when Kev is unsure. Compared with the
   same LLM answering the same questions itself: 88% → 94% routed right, 17.6 s → 1.6 s median ([benchmark](docs/benchmark.md)).
   Choosing the server first, then the tool, lets it scale: with 31 tools across 4 MCP servers, right tool
   25/42 → 40/42, ~30 s → 4.4 s per message ([results](#adding-a-big-real-world-mcp-server-with-zero-code-changes)).
2. **Answers should be interfaces, not paragraphs.** The UI is inferred from the shape of whatever data an MCP server
   returns (charts, maps, tables, cards), with no per-server code. Follow-ups like "as a table" re-render without
   calling the LLM.

In practice it's a chat-driven dashboard. You plug in data sources (any [MCP](https://modelcontextprotocol.io) server), and when you ask
"weather in Berlin this week" or "compare Apple with Nvidia", it picks the right tool, fills in the arguments, fetches the
data and draws it with the right widget. Follow up with "as a table", "on a map" or "what about Tehran?" and the canvas updates.

Everything runs locally: routing by [Kev](https://github.com/jaredpalmer/kev) (a tiny, calibrated decision model, ~0.2 s),
details by any chat model (Ollama by default), data by MCP servers.

## Goal

Add an MCP server, and you're done. You get a dashboard that shows that server's data as live widgets: charts,
tables, maps, boards, detail cards. You change what you see by asking in plain words.

- **For people who don't write code.** No code, no per-server setup, no mapping work. Add the MCP server and start
  using the dashboard.
- **Works with any MCP server.** Nothing in ColdHarbor is written for one server (GitHub, Linear, a database…).
  Everything is inferred from what servers already expose: tool names, descriptions, input schemas, annotations
  (`readOnlyHint`, `destructiveHint`) and the shape of the data they return.
- **Fast and accurate on small, cheap models.** A "System One" decision model ([Kev](https://github.com/jaredpalmer/kev))
  makes the quick, frequent calls (which tool, which widget, is this a follow-up?) with calibrated confidence in about
  a second. A small local LLM is used only where language is needed (filling in tool arguments) or when Kev is unsure.
  On this repo's benchmark Kev with the LLM as a second opinion gets 94% of routing right versus 88% for the LLM alone,
  with an 11× faster median; see [docs/benchmark.md](docs/benchmark.md).
- **Safe by default.** Tools that only read run on their own. Anything that can change data asks you first.

### Principles

When you build a feature, check it against these:

- **No server-specific code.** If it only works for one MCP server, it doesn't belong in ColdHarbor.
- **Infer, don't configure.** Use what the server already tells us before adding a setting or asking the user.
- **Ask when unsure, never guess silently.** Low confidence becomes a question, not a quiet wrong answer.
- **Read-only runs itself; writes need a click.** Respect tool annotations; when a server gives none, only clearly
  read-only names (`get_…`, `list_…`, `search_…`) run on their own.
- **Small models + System One over one big model.** Fast calibrated decisions first, the LLM only where it's needed.
- **Show why.** Every step the engine takes should be visible to the user.

## Results: before and after

All numbers are from this repo's scripts on one laptop (Apple M4, 16 GB), with a small local LLM (`qwen3.5` via Ollama)
and Kev's smallest model (`kev-0.8b`). The test sets are small; treat a difference of one or two messages as noise.

### A System One model beats an LLM at routing, and is 11× faster

The same engine, sources and widgets, and the same 13 questions per message (which tool, one per widget, is it a
follow-up…), which the LLM answers in a single call. Only who answers changes. From [`pnpm bench`](docs/benchmark.md):

| | Before: the LLM answers | After: Kev answers, the LLM only when Kev is unsure |
|---|---|---|
| Tool and view both right | 28/32 (88%) | **30/32 (94%)** |
| Right view (chart, table, map…) | 28/32 | **32/32** |
| Fetched the wrong source with confidence | 0 | 0 |
| Routing time, median | 17.6 s | **1.6 s (11× faster)** |
| 9-message conversation | 8/9 right, 183 s, 15 LLM calls | **9/9 right, 76 s, 10 LLM calls** |

The LLM kept inventing view requests nobody made ("is Amazon stock up this month?" → a line chart, "tell me a joke" →
a text view). Follow-ups like "as a table" skip the LLM and the data call entirely: about 2 s instead of 17.

### Adding a big real-world MCP server, with zero code changes

We connected GitHub's official MCP server (26 tools) next to the 5 built-in ones: 31 tools across 4 servers.
Before: one choice among all 31 tools. After: Kev picks the server, then the tool on that server, and the LLM only
checks Kev's shortlist of 6 when Kev is unsure. From `pnpm bench hybrid` with GitHub connected:

| | Before: one choice among 31 tools | After: server → tool → shortlist |
|---|---|---|
| Right tool | 25/42 | **40/42** |
| GitHub questions | 0/10 | **10/10** |
| Right view | 42/42 | 42/42 |
| Time per message | ~30 s | **4.4 s** |

In every miss before, Kev's first guess was already right; with 31 similar options its confidence was just spread too thin.
(Measured on 2026-09-26, before the System One refactor; Kev's questions are unchanged since.)

### Unfamiliar data, drawn without mapping code

MCP servers return whatever JSON they like. A GitHub commit, as it arrives:

```json
{ "sha": "98b6fd8…", "commit": { "message": "v16.4.0-canary.49\n\n…", "author": { "name": "…", "email": "…", "date": "2026-09-26T20:46:58Z" } },
  "author": { "login": "next-js-bot[bot]", "id": 279046576, "avatar_url": "…" }, "html_url": "https://github.com/…", "node_id": "…" }
```

| Before | After |
|---|---|
| A table with raw JSON in the cells (`commit: {"message":…}`), ids, API links and avatars | **Headlines**: "v16.4.0-canary.49" (first line of the message), author, "2h ago", a link to the commit. The full message stays available. Ids, emails, API links and avatars are dropped. |

The same rules turn a pull request list into headlines, one issue into a detail card with its body rendered, and a
README into formatted text. None of them mention GitHub.

## The idea: three parts that never import each other

```
 Sources                      Frames                      Widgets
 (MCP servers)      ───────►  the one shared   ◄───────   (React + shadcn/ui)
 weather, markets,            data shape                  line, bar, map, table,
 news, GitHub, your DB…                                   cards, headlines, text
                    ▲                                ▲
                    └──────────── Engine ────────────┘
                      System One (Kev, or an LLM): which tool? which widget? a follow-up?
                      LLM: fill in the tool's arguments
```

- A **source** is any MCP server. It knows nothing about ColdHarbor's UI. ColdHarbor sources return **Frames** (below);
  other MCP servers work too: their JSON becomes a table, their text becomes a text widget.
- A **widget** is a React component plus a tiny spec: *which frames can I draw?* and *a yes/no question System One
  answers about the message* ("Does the message ask for a map?"). It knows nothing about sources.
- The **engine** turns each message into questions for System One, fills in arguments, calls the tool and picks the
  widget, reporting every step so the UI can show *why*.

Every quick decision is a question with a probability and a threshold. Kev and an LLM implement the same one-method
interface (`decide(message, questions)`), so swapping who answers changes nothing else.

### Frames

```ts
interface Frame {
  title: string;
  subtitle?: string;
  fields: { name: string; type: "time" | "number" | "string" | "text" | "url" | "lat" | "lon"; unit?: string; label?: string }[];
  rows: Record<string, string | number | null>[];
  prefer?: string[];      // widget ids this frame suits best
  labelField?: string;    // the field that names each row
  groupField?: string;    // a field with a few values (status…) to group rows by
}
```

It's a zod schema in [`core/frame.ts`](core/frame.ts), so a source's output is validated, not trusted.

A tool can return several frames (e.g. weather returns *the metric over time*, *right now with coordinates*, and *daily details*).
Each widget draws the frame it scores highest, so switching from a chart to a map just picks another frame.

## Quick start

Requirements: Node ≥ 22.18, pnpm, [Ollama](https://ollama.com) with a model (`ollama pull qwen3.5`), and optionally Kev.

```bash
pnpm install
pnpm probe           # connects to every source, pings System One and the LLM
pnpm dev             # http://127.0.0.1:3100
```

Kev (recommended; without it set `"router": { "type": "llm" }`):

```bash
git clone https://github.com/jaredpalmer/kev && cd kev && uv sync --extra serve
uv run --extra serve python -m kev.serve --run jaredpalmer/kev-0.8b --port 8009
```

## Configure: `coldharbor.config.json`

```jsonc
{
  "router": { "type": "hybrid", "baseUrl": "http://127.0.0.1:8009" }, // "hybrid" | "kev" | "llm"
  "llm": { "provider": "ollama", "model": "qwen3.5:latest" },          // or "openai" + baseUrl + apiKey (any compatible API)
  "mcpServers": {                                                     // same format as Claude Desktop
    "weather": { "command": "node", "args": ["sources/weather.ts"] },
    "github":  { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" } },
    "remote":  { "url": "https://example.com/mcp" }
  }
}
```

`${NAME}` is replaced with the environment variable `NAME`, so secrets stay out of the file.

## Add a source

Any MCP server works. To get the best widgets, return Frames. `defineSource` makes that a few lines, e.g. in
`sources/earthquakes.ts`:

```ts
import { defineSource, tool, z } from "../core/source.ts";

defineSource({
  name: "earthquakes",
  tools: {
    recent: tool({
      title: "Earthquakes",
      description: 'Recent earthquakes worldwide. E.g. "earthquakes this week", "big quakes in Japan".',
      input: { minMagnitude: z.number().default(4.5) },
      async run({ minMagnitude }) {
        const j = await (await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson")).json();
        return {
          title: `Earthquakes ≥ ${minMagnitude} this week`,
          fields: [{ name: "place", type: "string" }, { name: "lat", type: "lat" }, { name: "lon", type: "lon" }, { name: "magnitude", type: "number" }],
          rows: j.features.filter((f: any) => f.properties.mag >= minMagnitude)
            .map((f: any) => ({ place: f.properties.place, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], magnitude: f.properties.mag })),
          labelField: "place",
          prefer: ["map", "table"],
        };
      },
    }),
  },
}).start();
```

Add `"earthquakes": { "command": "node", "args": ["sources/earthquakes.ts"] }` to `mcpServers` and restart. It's a normal MCP server, so Claude Desktop, Cursor and others can use it too
(they get a readable text table).

Tips: write the `description` for System One, with a short example of what users ask. Keep inputs few and well described;
the LLM fills them from the user's words.

## Add a widget

1. In `widgets/specs.ts`, what it can draw and the question System One answers:

   ```ts
   {
     id: "gauge",
     name: "Gauge",
     ask: "Does the message ask for a gauge or dial?",
     score: (f) => (fieldsOf(f, "number").length && f.rows.length === 1 ? 0.6 : 0),
   },
   ```

2. `widgets/gauge.tsx`: a React component that takes `{ frame }`. Use anything from `components/ui` (shadcn).
3. Add it to `widgets/views.tsx`.

## Repo layout

```
coldharbor.config.json   what's connected
core/                    no React
  frame.ts               the Frame contract (zod) and the widget spec
  systemone.ts           decide(message, questions): Kev, or any chat model
  route.ts               which tool, which widget, follow-up? (questions + thresholds)
  engine.ts              route → fill → gate → fetch → draw
  fill.ts, hints.ts      tool arguments; who you are and what a server contains
  infer.ts               any JSON or printed text → Frames
  mcp.ts, llm.ts         the MCP hub; the chat model
  canvas.ts, server.ts   the canvas the server owns, and the intents that change it
  source.ts              defineSource(): a Frame-returning MCP server in a few lines
sources/                 weather (Open-Meteo), markets (Yahoo Finance, CoinGecko, ECB), news (GDELT): no keys
widgets/                 specs.ts, views.tsx, one file per widget
app/, components/        Next.js + shadcn/ui + motion: chat and canvas
scripts/                 probe (check everything, or one server), bench (→ docs/benchmark.md), cases
```

## Who answers the quick questions

| `router.type` | Who answers | Trade-off |
|---|---|---|
| `hybrid` (default) | Kev; the LLM chooses from Kev's shortlist when Kev is unsure which tool is meant | Kev's speed on most messages, the LLM's judgment on the hard ones |
| `kev` | Kev only | Fastest; unsure messages become a "which one?" question |
| `llm` | The LLM, for every question | Needs nothing extra; slowest, and it tends to invent view requests |

Measured on this repo's sources, with `pnpm bench`: see **[docs/benchmark.md](docs/benchmark.md)** for accuracy, confidently-wrong answers,
routing time and a full conversation, message by message.

## How a message flows

1. **Route**: System One answers the widget and follow-up questions and picks a tool. With many tools it first picks the
   server, then the tool on that server. Probabilities are calibrated; the engine acts only when it's sure enough, gets a
   second opinion from the LLM on Kev's shortlist when it isn't, and **asks you** when neither is sure.
   "As a table" is only a view change: no LLM call, no data call.
2. **Fill**: the LLM writes the tool's arguments from its JSON Schema, keeping the previous ones for follow-ups. Values
   nobody said are dropped; required ones still missing are asked for.
3. **Gate**: tools that only read run on their own. Anything else shows you the exact call first.
4. **Fetch**: the MCP tool is called, unless the same call is already on screen.
5. **Draw**: a widget you asked for, else the same view as before, else the best fit for the frames.

The canvas lives on the server (and survives restarts). The browser sends intents that point at things by id, like
"ask this", "run the call you proposed in run 3", or "refresh tile 7"; it can never describe a tool call itself, so another
page can't make ColdHarbor run one. The dev server only listens on 127.0.0.1.

Every step is streamed to the UI and kept on the tile ("Why this?"). Here "show it as a table" was recognised as a
view change, so no LLM call and no new data were needed:

![The "Why this?" panel on a tile: Kev's scores, "only a view change, so no LLM call and no new data", and the exact tool call](docs/screenshots/why.png)

## License

MIT
