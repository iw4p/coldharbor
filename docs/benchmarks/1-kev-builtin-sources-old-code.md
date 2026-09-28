# Benchmark: routing with and without Kev (System One)

ColdHarbor turns a message into *which tool* and *which widget*, then an LLM fills in the tool's arguments. This compares three ways to make that first decision:

- **Before:** qwen3.5 (a local qwen3.5:latest via ollama) decides the tool and the widget for every message.
- **Kev:** [Kev](https://github.com/jaredpalmer/kev)'s System One model decides; qwen3.5 only fills in arguments, and is skipped when a message only changes the view.
- **Kev + qwen3.5 (hybrid, the default):** Kev decides, and hands the message to qwen3.5 only when it's unsure which tool is meant but the message names something new. Widget requests always come from Kev.

Everything else is identical: the engine, the thresholds (act on a tool at ≥ 55.00000000000001%, treat a view request as explicit at ≥ 75%), the MCP sources and the widgets.

Run on 2026-09-27 · Apple M4 · 16 GB RAM · Kev `jaredpalmer/kev-0.8b` (mlx bfloat16) · 5 tools from 3 MCP servers · 9 widgets.
Reproduce with `pnpm bench` (needs Kev on http://127.0.0.1:8009 and the LLM running). Raw numbers: `docs/benchmark.json`.

## Summary

| | Before: qwen3.5 routes | Kev routes | Kev + qwen3.5 when unsure |
|---|---|---|---|
| **Routing: tool and view both right** | **29/32 (91%)** | **27/32 (84%)** | **30/32 (94%)** |
| Routing: right tool | 32/32 (100%) | 27/32 (84%) | 30/32 (94%) |
| Routing: right view request | 29/32 (91%) | 32/32 (100%) | 32/32 (100%) |
| Confidently wrong (fetched the wrong source) | 0 | 0 | 0 |
| **Routing time, median** | **5.8 s** | **1.3 s** (4.6× faster) | **1.3 s** (4.4× faster) |
| Routing time, p95 | 6.7 s | 1.4 s | 8.9 s |
| Messages sent to the LLM for routing | 32/32 | 0/32 | 9/32 |
| **Conversation (9 turns): right** | **8/9** | **9/9** | **9/9** |
| **Conversation: total time** | **94.7 s** | **40.1 s** (2.4× faster) | **81.3 s** (1.2× faster) |
| Conversation: LLM calls | 13 | 6 | 10 |

"Confidently wrong" is the error that matters most: the router was sure enough to act, and ColdHarbor fetched and drew the wrong data.
When a router isn't sure, ColdHarbor asks you instead, which costs a click, not a wrong answer.

## By kind of message (tool and view both right)

| Kind | Before: qwen3.5 routes | Kev routes | Kev + qwen3.5 when unsure |
|---|---|---|---|
| direct (20) | 18/20 | 15/20 | 18/20 |
| follow-up (8) | 7/8 | 8/8 | 8/8 |
| off-topic (4) | 4/4 | 4/4 | 4/4 |

## Every routing decision

✓ right · ✗ wrong but safe (ColdHarbor asks, or keeps the current tile) · ✗✗ confidently wrong · ↗ escalated to qwen3.5

| Message | Expected | Before: qwen3.5 routes | Kev routes | Kev + qwen3.5 when unsure |
|---|---|---|---|---|
| What's the weather in Berlin this week? | forecast | ✓ forecast 100% · 6.3 s | ✓ forecast 89% · 1.1 s | ✓ forecast 89% · 1.7 s |
| will it rain in London tomorrow? | forecast | ✓ forecast 100% · 5.3 s | ✓ forecast 88% · 1.1 s | ✓ forecast 88% · 1.4 s |
| how cold will it get in Oslo this weekend | forecast | ✗ forecast 100% · stat · 5.4 s | ✓ forecast 90% · 1.1 s | ✓ forecast 90% · 1.3 s |
| weather in Berlin, Paris and Rome on a map | forecast · map | ✓ forecast 100% · map · 5.3 s | ✓ forecast 62% · map · 1.1 s | ✓ forecast 62% · map · 1.3 s |
| temperature in Tokyo for the next 10 days as a line chart | forecast · line | ✓ forecast 100% · line · 6.5 s | ✓ forecast 90% · line · 1.2 s | ✓ forecast 90% · line · 1.3 s |
| How has Apple stock done this year? | stock_prices · line | ✓ stock_prices 100% · line · 6.3 s | ✓ stock_prices 77% · 1.2 s | ✓ stock_prices 77% · 1.3 s |
| compare Tesla and Nvidia in a chart | stock_prices · line/bar | ✓ stock_prices 100% · line · 4.2 s | ✗ none · line · 1.2 s | ✗ none · line · 1.3 s |
| MSFT share price over the last 5 days as a table | stock_prices · table | ✓ stock_prices 100% · table · 5.5 s | ✓ stock_prices 84% · table · 1.4 s | ✓ stock_prices 84% · table · 1.3 s |
| is Amazon stock up this month? | stock_prices | ✗ stock_prices 100% · line · 5.4 s | ✓ stock_prices 72% · 1.4 s | ✓ stock_prices 72% · 1.3 s |
| bitcoin price right now | crypto_prices · stat | ✓ crypto_prices 100% · stat · 5.4 s | ✓ crypto_prices 92% · 1.3 s | ✓ crypto_prices 92% · 1.3 s |
| ETH vs SOL this month | crypto_prices · line | ✓ crypto_prices 100% · line · 5.4 s | ✓ crypto_prices 83% · 1.3 s | ✓ crypto_prices 83% · 1.2 s |
| how much is one dogecoin worth | crypto_prices · stat | ✓ crypto_prices 100% · stat · 6.1 s | ✓ crypto_prices 82% · 1.3 s | ✓ crypto_prices 82% · 1.2 s |
| euro to dollar over the last 3 months as a table | exchange_rates · table | ✓ exchange_rates 100% · table · 6.7 s | ✗ none · table · 1.3 s | ✗ none · table · 1.3 s |
| EUR to GBP rate | exchange_rates · stat | ✓ exchange_rates 100% · stat · 5.5 s | ✓ exchange_rates 55% · 1.3 s | ✓ exchange_rates 55% · 1.3 s |
| how many yen is one dollar | exchange_rates · stat | ✓ exchange_rates 100% · stat · 6.6 s | ✗ none · 1.3 s | ✓ ↗ exchange_rates 100% · 9.0 s |
| latest news about electric cars | search_news · feed | ✓ search_news 100% · feed · 5.7 s | ✓ search_news 55% · 1.3 s | ✓ search_news 55% · 1.6 s |
| what's happening with the elections in Brazil | search_news · feed | ✓ search_news 100% · feed · 6.6 s | ✗ none · 1.3 s | ✓ ↗ search_news 100% · 8.9 s |
| headlines on AI regulation | search_news · feed | ✓ search_news 100% · feed · 5.7 s | ✗ none · 1.3 s | ✓ ↗ search_news 100% · 8.0 s |
| any news about the earthquake in Japan | search_news · feed | ✓ search_news 100% · feed · 5.7 s | ✓ search_news 71% · 1.3 s | ✓ search_news 71% · 1.5 s |
| bar chart of news about OpenAI by country | search_news · bar | ✓ search_news 90% · bar · 6.7 s | ✓ search_news 57% · bar · 1.3 s | ✓ search_news 57% · bar · 1.3 s |
| yeah show it as a table | none · table | ✓ none · table · 5.8 s | ✓ none · table · 1.3 s | ✓ none · table · 1.2 s |
| bar chart please | none · bar | ✓ none · bar · 5.8 s | ✓ none · bar · 1.3 s | ✓ none · bar · 1.2 s |
| show it on a map | none · map | ✓ none · map · 5.7 s | ✓ none · map · 1.3 s | ✓ none · map · 1.3 s |
| as a line graph | none · line | ✓ none · line · 5.8 s | ✓ none · line · 1.1 s | ✓ none · line · 1.2 s |
| just give me the number | none · stat | ✓ none · 5.8 s | ✓ none · 1.2 s | ✓ ↗ none · 7.7 s |
| what about Tehran? | none / forecast | ✓ forecast 90% · 5.9 s | ✓ none · 1.3 s | ✓ ↗ forecast 90% · 8.1 s |
| compare it with Nvidia | none / stock_prices | ✗ stock_prices 90% · bar · 6.0 s | ✓ none · 1.4 s | ✓ ↗ stock_prices 90% · 8.3 s |
| and for the last year? | none | ✓ none · 5.8 s | ✓ none · 1.3 s | ✓ ↗ none · 8.1 s |
| tell me a joke | none | ✓ none · 6.5 s | ✓ none · 1.3 s | ✓ ↗ none · 8.9 s |
| what's the capital of France | none | ✓ none · 6.1 s | ✓ none · 1.3 s | ✓ none · 1.8 s |
| write me a poem about the sea | none | ✓ none · 6.1 s | ✓ none · 1.3 s | ✓ none · 1.4 s |
| hi | none | ✓ none · 6.7 s | ✓ none · 1.3 s | ✓ ↗ none · 8.4 s |

## End-to-end conversation

The same 9 messages in a row through the real engine and MCP sources, with follow-ups referring to the previous tile.

| # | Message | Before: qwen3.5 routes | Kev routes | Kev + qwen3.5 when unsure |
|---|---|---|---|---|
| 1 | What's the weather in Berlin this week? | ✓ 14.9 s · 2 LLM<br><sub>forecast → line {"cities":["Berlin"],"days":7,"past":false,"metric":"temperature"}</sub> | ✓ 8.7 s · 1 LLM<br><sub>forecast → line {"cities":["Berlin"],"days":7,"past":false,"metric":"temperature"}</sub> | ✓ 7.9 s · 1 LLM<br><sub>forecast → line {"cities":["Berlin"],"days":7,"past":false,"metric":"temperature"}</sub> |
| 2 | show it as a table | ✓ 7.5 s · 1 LLM<br><sub>forecast → table {"cities":["Berlin"],"days":7,"past":false,"metric":"temperature"}</sub> | ✓ 1.8 s · 0 LLM<br><sub>forecast → table {"cities":["Berlin"],"days":7,"past":false,"metric":"temperature"}</sub> | ✓ 1.7 s · 0 LLM<br><sub>forecast → table {"cities":["Berlin"],"days":7,"past":false,"metric":"temperature"}</sub> |
| 3 | what about Tehran? | ✓ 13.4 s · 2 LLM<br><sub>forecast → table {"cities":["Berlin","Tehran"],"days":7,"past":false,"metric":"temperature"}</sub> | ✓ 7.0 s · 1 LLM<br><sub>forecast → table {"cities":["Berlin","Tehran"],"days":7,"past":false,"metric":"temperature"}</sub> | ✓ 26.4 s · 2 LLM<br><sub>forecast → table {"cities":["Berlin","Tehran"],"days":7,"past":false,"metric":"temperature"}</sub> |
| 4 | How has Apple stock done this year? | ✓ 14.6 s · 2 LLM<br><sub>stock_prices → line {"symbols":["AAPL"],"range":"1y"}</sub> | ✓ 4.0 s · 1 LLM<br><sub>stock_prices → line {"symbols":["AAPL"],"range":"1y"}</sub> | ✓ 6.1 s · 1 LLM<br><sub>stock_prices → line {"symbols":["AAPL"],"range":"1y"}</sub> |
| 5 | compare it with Nvidia | ✓ 7.6 s · 1 LLM<br><sub>stock_prices → line {"symbols":["AAPL"],"range":"1y"}</sub> | ✓ 6.5 s · 1 LLM<br><sub>stock_prices → line {"symbols":["AAPL","NVDA"],"range":"1y"}</sub> | ✓ 13.3 s · 2 LLM<br><sub>stock_prices → line {"symbols":["AAPL","NVDA"],"range":"1y"}</sub> |
| 6 | bar chart please | ✓ 8.1 s · 1 LLM<br><sub>stock_prices → bar {"symbols":["AAPL"],"range":"1y"}</sub> | ✓ 1.5 s · 0 LLM<br><sub>stock_prices → bar {"symbols":["AAPL","NVDA"],"range":"1y"}</sub> | ✓ 1.6 s · 0 LLM<br><sub>stock_prices → bar {"symbols":["AAPL","NVDA"],"range":"1y"}</sub> |
| 7 | and for the last 5 days? | ✗ 8.1 s · 1 LLM<br><sub>stock_prices → line {"symbols":["AAPL"],"range":"1y"}</sub> | ✓ 6.4 s · 1 LLM<br><sub>stock_prices → bar {"symbols":["AAPL","NVDA"],"range":"5d"}</sub> | ✓ 13.3 s · 2 LLM<br><sub>stock_prices → bar {"symbols":["AAPL","NVDA"],"range":"5d"}</sub> |
| 8 | bitcoin price right now | ✓ 12.9 s · 2 LLM<br><sub>crypto_prices → stat {"coins":["bitcoin"],"days":1}</sub> | ✓ 2.9 s · 1 LLM<br><sub>crypto_prices → stat {"coins":["bitcoin"],"days":1}</sub> | ✓ 2.6 s · 1 LLM<br><sub>crypto_prices → stat {"coins":["bitcoin"],"days":1}</sub> |
| 9 | tell me a joke | ✓ 7.5 s · 1 LLM<br><sub>said: not a data request</sub> | ✓ 1.4 s · 0 LLM<br><sub>said: not a data request</sub> | ✓ 8.6 s · 1 LLM<br><sub>said: not a data request</sub> |
| | **Total** | **94.7 s · 13 LLM calls** | **40.1 s · 6 LLM calls** | **81.3 s · 10 LLM calls** |

## Method

- 32 hand-labelled messages (`scripts/cases.ts`): 20 direct requests across 5 tools, 8 follow-ups that only make sense with a previous tile, 4 off-topic messages. Some accept more than one answer (e.g. "compare it with Nvidia" may name the stock tool or defer to the current tile).
- Each router is warmed up once (model loading not timed), then routes every message once. Both models run at temperature 0.
- The LLM's confidence is self-reported; Kev's is a calibrated probability.
- Wall-clock times on one machine with both models loaded. The conversation includes real API calls (Open-Meteo, Yahoo Finance, CoinGecko), identical for every router.
- Small test set: treat differences of one or two messages as noise.
