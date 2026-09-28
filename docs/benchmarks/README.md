# Every benchmark run

Each run is `pnpm bench` on one laptop (Apple M4, 16 GB), comparing three ways to answer the quick questions: the LLM
alone, System One alone, and System One with the LLM as a second opinion when it's unsure (the default). "Right" means
tool and view both right. Dates are UTC. The test sets are small; treat a difference of one or two messages as noise.

| # | Setup | Messages | LLM alone | System One alone | System One + LLM | Conversation (9 turns) |
|---|---|---|---|---|---|---|
| 1 | Kev 0.8B (local) · qwen3.5 (Ollama) · 3 built-in sources, 5 tools · code before the refactor | 32 | 29/32 · 5.8 s | 27/32 · 1.3 s | 30/32 · 1.3 s | 8/9 · 9/9 · 9/9 |
| 2 | Same, after the refactor (the LLM now answers the same questions as Kev) | 32 | 28/32 · 17.6 s | 27/32 · 1.6 s | 30/32 · 1.6 s | 8/9 · 9/9 · 9/9 |
| 3 | Kev · qwen3.5 · 3 third-party servers (Open-Meteo, CoinGecko, Hacker News), 36 tools | 32 | 19/32 · 19.1 s * | 12/32 · 4.5 s | 26/32 · 13.2 s | 2/9 · 0/9 · 8/9 |
| 4 | Jev (hosted) · qwen3.5 · the same 3 servers | 32 | 24/32 · 22.8 s | 22/32 · 0.51 s | 23/32 · 0.56 s | 5/9 · 6/9 · 6/9 |
| 5 | **Jev · qwen3.8-27b (Groq) · 6 servers (+ USGS earthquakes, World Bank, arXiv), 51 tools** | 38 | 28/38 · 7.8 s | 35/38 · 0.53 s | **36/38 · 0.54 s** | 7/9 · 9/9 · **9/9** |

Times are median routing time per message. Reports: [1](1-kev-builtin-sources-old-code.md), [2](2-kev-builtin-sources.md),
[3](3-kev-real-servers.md), [4](4-jev-real-servers.md), [5](../benchmark.md) (the current one, with raw numbers in
[benchmark.json](../benchmark.json)).

## What changed between runs

- **1 → 2:** one package, System One as the only decision interface. Kev's results are unchanged; the LLM now answers
  the same 13 questions Kev does (one per widget), in one call, so it writes more and takes longer.
- **2 → 3:** ColdHarbor's own demo sources were replaced by third-party MCP servers. Their tool descriptions are written
  for coding agents, the weather server has ten near-identical forecast tools, and two-step routing multiplies
  confidence, so Kev alone was rarely sure enough to act (its top guess was usually right). The LLM column is
  under-counted here: *a parser only accepted `{"tool": "<id>"}`, and qwen often answers `{"<id>": true}`.
- **3 → 4:** Jev instead of Kev, and the parser fix. Jev is about as accurate as the LLM at picking tools, 45× faster.
  Its misses were mostly views: it answered "yes" to the widget question "the details of one specific item?" for
  almost anything.
- **4 → 5:** a sharper details question, line charts for time series, readable tool titles, fan-out comparisons, the
  argument repair, three more servers and six more messages, and Groq for the LLM. Jev's two remaining misses pick the
  Norwegian and Japanese weather services' own forecasts for Oslo and Tokyo.

Two earlier runs aren't listed because a bug in the code made them unfair to the LLM: one read `"true"` (a string) as
no, the other is the parser bug above.

## Checks

Beyond `pnpm typecheck` (clean), these were run by hand against the dev server:

| Check | Result |
|---|---|
| A request with another site's host name | 403 |
| A cross-site style `text/plain` post | 403 |
| A made-up tool call instead of an intent | 400, nothing runs |
| Approving a call that was cancelled | nothing runs, the database is untouched |
| Approving the same call twice | the second does nothing |
| Refreshing a tile from a tool that can change things | refused |
| Closing the tab during a run | the run finishes and the canvas is saved |
| Reloading the page | chat and tiles come back from the server |
