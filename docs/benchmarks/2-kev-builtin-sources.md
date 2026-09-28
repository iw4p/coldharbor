# Benchmark: routing with and without Kev (System One)

ColdHarbor turns a message into *which tool* and *which widget*, then an LLM fills in the tool's arguments. This compares three ways to answer those quick questions:

- **Before:** qwen3.5 (a local qwen3.5:latest via ollama) answers the quick questions for every message: which tool, which view, is it a follow-up, did it make a value up?
- **Kev:** [Kev](https://github.com/jaredpalmer/kev)'s System One model answers them; qwen3.5 only fills in arguments, and is skipped when a message only changes the view.
- **Kev + qwen3.5 (hybrid, the default):** Kev answers them, and qwen3.5 chooses from Kev's shortlist only when Kev is unsure which tool is meant. View requests always come from Kev.

All three get exactly the same questions, with the same options.

Everything else is identical: the engine, the thresholds (act on a tool at ≥ 55.00000000000001%, treat a view request as explicit at ≥ 75%), the MCP sources and the widgets.

Run on 2026-09-27 · Apple M4 · 16 GB RAM · Kev `jaredpalmer/kev-0.8b` (mlx bfloat16) · 5 tools from 3 MCP servers · 9 widgets.
Reproduce with `pnpm bench` (needs Kev on http://127.0.0.1:8009 and the LLM running). Raw numbers: `docs/benchmark.json`.

## Summary

| | Before: qwen3.5 answers | Kev answers | Kev + qwen3.5 when unsure |
|---|---|---|---|
| **Routing: tool and view both right** | **28/32 (88%)** | **27/32 (84%)** | **30/32 (94%)** |
| Routing: right tool | 32/32 (100%) | 27/32 (84%) | 30/32 (94%) |
| Routing: right view request | 28/32 (88%) | 32/32 (100%) | 32/32 (100%) |
| Confidently wrong (fetched the wrong source) | 0 | 0 | 0 |
| **Routing time, median** | **17.6 s** | **1.6 s** (11.3× faster) | **1.6 s** (11.1× faster) |
| Routing time, p95 | 23.4 s | 1.9 s | 5.5 s |
| Messages sent to the LLM for routing | 32/32 | 0/32 | 9/32 |
| **Conversation (9 turns): right** | **8/9** | **9/9** | **9/9** |
| **Conversation: total time** | **182.8 s** | **49.9 s** (3.7× faster) | **76.2 s** (2.4× faster) |
| Conversation: LLM calls | 15 | 6 | 10 |

"Confidently wrong" is the error that matters most: System One was sure enough to act, and ColdHarbor fetched and drew the wrong data.
When it isn't sure, ColdHarbor asks you instead, which costs a click, not a wrong answer.

## By kind of message (tool and view both right)

| Kind | Before: qwen3.5 answers | Kev answers | Kev + qwen3.5 when unsure |
|---|---|---|---|
| direct (20) | 19/20 | 15/20 | 18/20 |
| follow-up (8) | 8/8 | 8/8 | 8/8 |
| off-topic (4) | 1/4 | 4/4 | 4/4 |

## Every routing decision

✓ right · ✗ wrong but safe (ColdHarbor asks, or keeps the current tile) · ✗✗ confidently wrong · ↗ escalated to qwen3.5

| Message | Expected | Before: qwen3.5 answers | Kev answers | Kev + qwen3.5 when unsure |
|---|---|---|---|---|
| What's the weather in Berlin this week? | forecast | ✓ forecast 80% · 10.1 s | ✓ forecast 89% · 1.5 s | ✓ forecast 89% · 2.0 s |
| will it rain in London tomorrow? | forecast | ✓ forecast 80% · 9.8 s | ✓ forecast 88% · 1.1 s | ✓ forecast 88% · 1.6 s |
| how cold will it get in Oslo this weekend | forecast | ✓ forecast 80% · 10.1 s | ✓ forecast 90% · 1.2 s | ✓ forecast 90% · 1.6 s |
| weather in Berlin, Paris and Rome on a map | forecast · map | ✓ forecast 80% · map · 10.3 s | ✓ forecast 62% · map · 1.4 s | ✓ forecast 62% · map · 1.4 s |
| temperature in Tokyo for the next 10 days as a line chart | forecast · line | ✓ forecast 80% · line · 11.5 s | ✓ forecast 90% · line · 2.0 s | ✓ forecast 90% · line · 1.5 s |
| How has Apple stock done this year? | stock_prices · line | ✓ stock_prices 80% · line · 13.0 s | ✓ stock_prices 77% · 1.9 s | ✓ stock_prices 77% · 1.7 s |
| compare Tesla and Nvidia in a chart | stock_prices · line/bar | ✓ stock_prices 80% · line · 15.3 s | ✗ none · line · 1.6 s | ✗ none · line · 1.6 s |
| MSFT share price over the last 5 days as a table | stock_prices · table | ✓ stock_prices 80% · table · 18.7 s | ✓ stock_prices 84% · table · 1.5 s | ✓ stock_prices 84% · table · 1.6 s |
| is Amazon stock up this month? | stock_prices | ✗ stock_prices 80% · line · 23.4 s | ✓ stock_prices 72% · 1.6 s | ✓ stock_prices 72% · 1.5 s |
| bitcoin price right now | crypto_prices · stat | ✓ crypto_prices 80% · stat · 23.3 s | ✓ crypto_prices 92% · 1.5 s | ✓ crypto_prices 92% · 1.5 s |
| ETH vs SOL this month | crypto_prices · line | ✓ crypto_prices 80% · line · 24.3 s | ✓ crypto_prices 83% · 1.8 s | ✓ crypto_prices 83% · 1.5 s |
| how much is one dogecoin worth | crypto_prices · stat | ✓ crypto_prices 80% · stat · 22.5 s | ✓ crypto_prices 82% · 1.6 s | ✓ crypto_prices 82% · 1.5 s |
| euro to dollar over the last 3 months as a table | exchange_rates · table | ✓ exchange_rates 80% · table · 21.1 s | ✗ none · table · 1.6 s | ✗ none · table · 1.5 s |
| EUR to GBP rate | exchange_rates · stat | ✓ exchange_rates 80% · 20.7 s | ✓ exchange_rates 55% · 1.5 s | ✓ exchange_rates 55% · 1.6 s |
| how many yen is one dollar | exchange_rates · stat | ✓ exchange_rates 80% · stat · 20.7 s | ✗ none · 1.6 s | ✓ ↗ exchange_rates 80% · 4.6 s |
| latest news about electric cars | search_news · feed | ✓ search_news 80% · feed · 20.8 s | ✓ search_news 55% · 1.6 s | ✓ search_news 55% · 1.8 s |
| what's happening with the elections in Brazil | search_news · feed | ✓ search_news 80% · 20.7 s | ✗ none · 1.6 s | ✓ ↗ search_news 80% · 4.7 s |
| headlines on AI regulation | search_news · feed | ✓ search_news 80% · feed · 19.5 s | ✗ none · 1.6 s | ✓ ↗ search_news 80% · 4.8 s |
| any news about the earthquake in Japan | search_news · feed | ✓ search_news 80% · 17.4 s | ✓ search_news 71% · 1.6 s | ✓ search_news 71% · 1.6 s |
| bar chart of news about OpenAI by country | search_news · bar | ✓ search_news 80% · bar · 17.6 s | ✓ search_news 57% · bar · 1.5 s | ✓ search_news 57% · bar · 1.5 s |
| yeah show it as a table | none · table | ✓ none · table · 18.6 s | ✓ none · table · 1.5 s | ✓ none · table · 1.5 s |
| bar chart please | none · bar | ✓ none · bar · 17.5 s | ✓ none · bar · 1.5 s | ✓ none · bar · 1.4 s |
| show it on a map | none · map | ✓ none · map · 18.9 s | ✓ none · map · 1.6 s | ✓ none · map · 1.6 s |
| as a line graph | none · line | ✓ none · line · 19.5 s | ✓ none · line · 1.5 s | ✓ none · line · 1.4 s |
| just give me the number | none · stat | ✓ none · stat · 16.6 s | ✓ none · 1.6 s | ✓ ↗ none · 5.4 s |
| what about Tehran? | none / forecast | ✓ none · 16.5 s | ✓ none · 1.7 s | ✓ ↗ none · 5.1 s |
| compare it with Nvidia | none / stock_prices | ✓ none · 16.1 s | ✓ none · 1.5 s | ✓ ↗ none · 5.5 s |
| and for the last year? | none | ✓ none · 17.9 s | ✓ none · 1.5 s | ✓ ↗ none · 6.6 s |
| tell me a joke | none | ✗ none · text · 16.0 s | ✓ none · 1.6 s | ✓ ↗ none · 5.1 s |
| what's the capital of France | none | ✗ none · detail · 15.8 s | ✓ none · 1.6 s | ✓ none · 1.6 s |
| write me a poem about the sea | none | ✗ none · text · 15.7 s | ✓ none · 1.6 s | ✓ none · 1.5 s |
| hi | none | ✓ none · 15.9 s | ✓ none · 1.5 s | ✓ ↗ none · 4.5 s |

## End-to-end conversation

The same 9 messages in a row through the real engine and MCP sources, with follow-ups referring to the previous tile.

| # | Message | Before: qwen3.5 answers | Kev answers | Kev + qwen3.5 when unsure |
|---|---|---|---|---|
| 1 | What's the weather in Berlin this week? | ✓ 20.0 s · 2 LLM<br><sub>forecast → line {"cities":["Berlin"],"days":7,"past":false,"metric":"temperature"}</sub> | ✓ 10.8 s · 1 LLM<br><sub>forecast → line {"cities":["Berlin"],"days":7,"past":false,"metric":"temperature"}</sub> | ✓ 8.8 s · 1 LLM<br><sub>forecast → line {"cities":["Berlin"],"days":7,"past":false,"metric":"temperature"}</sub> |
| 2 | show it as a table | ✓ 16.5 s · 1 LLM<br><sub>forecast → table {"cities":["Berlin"],"days":7,"past":false,"metric":"temperature"}</sub> | ✓ 2.0 s · 0 LLM<br><sub>forecast → table {"cities":["Berlin"],"days":7,"past":false,"metric":"temperature"}</sub> | ✓ 1.9 s · 0 LLM<br><sub>forecast → table {"cities":["Berlin"],"days":7,"past":false,"metric":"temperature"}</sub> |
| 3 | what about Tehran? | ✓ 23.3 s · 2 LLM<br><sub>forecast → table {"cities":["Berlin","Tehran"],"days":7,"past":false,"metric":"temperature"}</sub> | ✓ 7.7 s · 1 LLM<br><sub>forecast → table {"cities":["Berlin","Tehran"],"days":7,"past":false,"metric":"temperature"}</sub> | ✓ 24.9 s · 2 LLM<br><sub>forecast → table {"cities":["Berlin","Tehran"],"days":7,"past":false,"metric":"temperature"}</sub> |
| 4 | How has Apple stock done this year? | ✓ 24.3 s · 2 LLM<br><sub>stock_prices → line {"symbols":["AAPL"],"range":"1y"}</sub> | ✓ 8.1 s · 1 LLM<br><sub>stock_prices → line {"symbols":["AAPL"],"range":"1y"}</sub> | ✓ 7.0 s · 1 LLM<br><sub>stock_prices → line {"symbols":["AAPL"],"range":"1y"}</sub> |
| 5 | compare it with Nvidia | ✓ 23.1 s · 2 LLM<br><sub>stock_prices → line {"symbols":["AAPL","NVDA"],"range":"1y"}</sub> | ✓ 7.4 s · 1 LLM<br><sub>stock_prices → line {"symbols":["AAPL","NVDA"],"range":"1y"}</sub> | ✓ 11.8 s · 2 LLM<br><sub>stock_prices → line {"symbols":["AAPL","NVDA"],"range":"1y"}</sub> |
| 6 | bar chart please | ✓ 17.0 s · 1 LLM<br><sub>stock_prices → bar {"symbols":["AAPL","NVDA"],"range":"1y"}</sub> | ✓ 2.2 s · 0 LLM<br><sub>stock_prices → bar {"symbols":["AAPL","NVDA"],"range":"1y"}</sub> | ✓ 1.7 s · 0 LLM<br><sub>stock_prices → bar {"symbols":["AAPL","NVDA"],"range":"1y"}</sub> |
| 7 | and for the last 5 days? | ✓ 22.4 s · 2 LLM<br><sub>stock_prices → bar {"symbols":["AAPL","NVDA"],"range":"5d"}</sub> | ✓ 6.8 s · 1 LLM<br><sub>stock_prices → bar {"symbols":["AAPL","NVDA"],"range":"5d"}</sub> | ✓ 11.3 s · 2 LLM<br><sub>stock_prices → bar {"symbols":["AAPL","NVDA"],"range":"5d"}</sub> |
| 8 | bitcoin price right now | ✓ 19.2 s · 2 LLM<br><sub>crypto_prices → stat {"coins":["bitcoin"],"days":1}</sub> | ✓ 3.1 s · 1 LLM<br><sub>crypto_prices → stat {"coins":["bitcoin"],"days":1}</sub> | ✓ 3.1 s · 1 LLM<br><sub>crypto_prices → stat {"coins":["bitcoin"],"days":1}</sub> |
| 9 | tell me a joke | ✗ 17.0 s · 1 LLM<br><sub>crypto_prices → stat {"coins":["bitcoin"],"days":1}</sub> | ✓ 1.8 s · 0 LLM<br><sub>said: not a data request</sub> | ✓ 5.7 s · 1 LLM<br><sub>said: not a data request</sub> |
| | **Total** | **182.8 s · 15 LLM calls** | **49.9 s · 6 LLM calls** | **76.2 s · 10 LLM calls** |

## Method

- 32 hand-labelled messages (`scripts/cases.ts`): 20 direct requests across 5 tools, 8 follow-ups that only make sense with a previous tile, 4 off-topic messages. Some accept more than one answer (e.g. "compare it with Nvidia" may name the stock tool or defer to the current tile).
- Each variant is warmed up once (model loading not timed), then routes every message once. Both models run at temperature 0.
- The LLM's confidence is self-reported; Kev's is a calibrated probability.
- Wall-clock times on one machine with both models loaded. The conversation includes real API calls (Open-Meteo, Yahoo Finance, CoinGecko), identical for every variant.
- Small test set: treat differences of one or two messages as noise.
