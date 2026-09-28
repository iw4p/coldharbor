# Benchmark: routing with and without Jev (System One)

ColdHarbor turns a message into *which tool* and *which widget*, then an LLM fills in the tool's arguments. This compares three ways to answer those quick questions:

- **Before:** qwen3.8-27b (a local qwen/qwen3.8-27b via openai) answers the quick questions for every message: which tool, which view, is it a follow-up, did it make a value up?
- **Jev:** the System One model (`jev-latest` at https://api.typesafe.ai) answers them; qwen3.8-27b only fills in arguments, and is skipped when a message only changes the view.
- **Jev + qwen3.8-27b (hybrid, the default):** Jev answers them, and qwen3.8-27b chooses from Jev's shortlist only when Jev is unsure which tool is meant. View requests always come from Jev.

All three get exactly the same questions, with the same options.

Everything else is identical: the engine, the thresholds (act on a tool at ≥ 55.00000000000001%, treat a view request as explicit at ≥ 75%), the MCP sources and the widgets.

Run on 2026-09-28 · Apple M4 · 16 GB RAM · Jev `jev-latest` (? ) · 51 tools from 6 MCP servers · 9 widgets.
Reproduce with `pnpm bench` (needs Jev at https://api.typesafe.ai and the LLM running). Raw numbers: `docs/benchmark.json`.

## Summary

| | Before: qwen3.8-27b answers | Jev answers | Jev + qwen3.8-27b when unsure |
|---|---|---|---|
| **Routing: tool and view both right** | **28/38 (74%)** | **35/38 (92%)** | **36/38 (95%)** |
| Routing: right tool | 37/38 (97%) | 35/38 (92%) | 36/38 (95%) |
| Routing: right view request | 29/38 (76%) | 38/38 (100%) | 38/38 (100%) |
| Confidently wrong (fetched the wrong source) | 1 | 2 | 2 |
| **Routing time, median** | **7.8 s** | **527 ms** (14.9× faster) | **543 ms** (14.4× faster) |
| Routing time, p95 | 10.7 s | 626 ms | 756 ms |
| Messages sent to the LLM for routing | 38/38 | 0/38 | 3/38 |
| **Conversation (9 turns): right** | **7/9** | **9/9** | **9/9** |
| **Conversation: total time** | **103.8 s** | **73.8 s** (1.4× faster) | **82.0 s** (1.3× faster) |
| Conversation: LLM calls | 24 | 6 | 8 |

"Confidently wrong" is the error that matters most: System One was sure enough to act, and ColdHarbor fetched and drew the wrong data.
When it isn't sure, ColdHarbor asks you instead, which costs a click, not a wrong answer.

## By kind of message (tool and view both right)

| Kind | Before: qwen3.8-27b answers | Jev answers | Jev + qwen3.8-27b when unsure |
|---|---|---|---|
| direct (26) | 20/26 | 23/26 | 24/26 |
| follow-up (8) | 7/8 | 8/8 | 8/8 |
| off-topic (4) | 1/4 | 4/4 | 4/4 |

## Every routing decision

✓ right · ✗ wrong but safe (ColdHarbor asks, or keeps the current tile) · ✗✗ confidently wrong · ↗ escalated to qwen3.8-27b

| Message | Expected | Before: qwen3.8-27b answers | Jev answers | Jev + qwen3.8-27b when unsure |
|---|---|---|---|---|
| What's the weather in Berlin this week? | weather_forecast | ✓ weather_forecast 76% · 703 ms | ✓ weather_forecast 76% · 496 ms | ✓ weather_forecast 79% · 509 ms |
| will it rain in London tomorrow? | weather_forecast | ✓ weather_forecast 76% · 614 ms | ✓ weather_forecast 96% · 578 ms | ✓ weather_forecast 97% · 571 ms |
| how cold will it get in Oslo this weekend | weather_forecast | ✗ weather_forecast 76% · stat · 710 ms | ✗✗ metno_forecast 84% · 542 ms | ✗✗ metno_forecast 87% · 566 ms |
| temperature in Tokyo for the next 10 days as a line chart | weather_forecast · line | ✓ weather_forecast 76% · line · 531 ms | ✗✗ jma_forecast 58% · line · 515 ms | ✗✗ jma_forecast 60% · line · 593 ms |
| weather in Paris as a table | weather_forecast · table | ✓ weather_forecast 76% · table · 606 ms | ✗ none · table · 592 ms | ✓ ↗ weather_forecast 95% · table · 659 ms |
| how warm was it in Rome last month? | weather_archive / weather_forecast · line | ✗ weather_archive 76% · stat · 6.8 s | ✓ weather_archive 100% · 512 ms | ✓ weather_archive 100% · 528 ms |
| air quality in Delhi today | air_quality | ✓ air_quality 78% · 10.7 s | ✓ air_quality 100% · 530 ms | ✓ air_quality 100% · 672 ms |
| bitcoin price right now | coingecko_get_prices · stat | ✓ coingecko_get_prices 76% · stat · 10.0 s | ✓ coingecko_get_prices 99% · stat · 564 ms | ✓ coingecko_get_prices 100% · stat · 527 ms |
| how much is one dogecoin worth | coingecko_get_prices · stat | ✓ coingecko_get_prices 76% · stat · 8.8 s | ✓ coingecko_get_prices 99% · stat · 696 ms | ✓ coingecko_get_prices 99% · stat · 519 ms |
| bitcoin price over the last 30 days | coingecko_get_market_chart · line | ✓ coingecko_get_market_chart 78% · line · 9.9 s | ✓ coingecko_get_market_chart 100% · line · 519 ms | ✓ coingecko_get_market_chart 100% · line · 525 ms |
| which coins are trending right now? | coingecko_get_trending · table | ✗ coingecko_get_trending 80% · feed · 9.0 s | ✓ coingecko_get_trending 100% · 527 ms | ✓ coingecko_get_trending 100% · 524 ms |
| top 10 cryptocurrencies by market cap | coingecko_list_markets · table | ✗ coingecko_list_markets 96% · bar · 10.0 s | ✓ coingecko_list_markets 100% · 502 ms | ✓ coingecko_list_markets 100% · 556 ms |
| how big is the whole crypto market? | coingecko_get_global / coingecko_list_markets · stat | ✓ coingecko_get_global 78% · stat · 8.8 s | ✓ coingecko_get_global 100% · stat · 549 ms | ✓ coingecko_get_global 100% · stat · 554 ms |
| top stories on Hacker News | getTopStories · feed | ✓ getTopStories 78% · feed · 8.6 s | ✓ getTopStories 100% · feed · 581 ms | ✓ getTopStories 100% · feed · 550 ms |
| latest Show HN posts | getShowHNStories · feed | ✓ getShowHNStories 76% · feed · 8.7 s | ✓ getShowHNStories 97% · feed · 497 ms | ✓ getShowHNStories 98% · feed · 559 ms |
| what are people asking on Ask HN? | getAskHNStories · feed | ✓ getAskHNStories 93% · feed · 8.0 s | ✓ getAskHNStories 100% · 574 ms | ✓ getAskHNStories 100% · 656 ms |
| newest Hacker News submissions | getNewStories · feed | ✓ getNewStories 78% · feed · 8.8 s | ✓ getNewStories 100% · feed · 516 ms | ✓ getNewStories 100% · feed · 580 ms |
| Hacker News job postings | getJobStories · feed | ✓ getJobStories 78% · feed · 7.9 s | ✓ getJobStories 100% · 626 ms | ✓ getJobStories 100% · 742 ms |
| best Hacker News stories as a table | getBestStories · table | ✓ getBestStories 80% · table · 8.4 s | ✓ getBestStories 100% · table · 545 ms | ✓ getBestStories 100% · table · 543 ms |
| bar chart of the top Hacker News stories by score | getTopStories · bar | ✓ getTopStories 76% · bar · 8.9 s | ✓ getTopStories 96% · bar · 514 ms | ✓ getTopStories 93% · bar · 502 ms |
| big earthquakes this week | earthquake_get_feed / earthquake_search · map | ✗ earthquake_search 76% · feed · 7.8 s | ✓ earthquake_get_feed 73% · 527 ms | ✓ earthquake_get_feed 70% · 569 ms |
| earthquakes near Tokyo this month on a map | earthquake_search · map | ✓ earthquake_search 72% · map · 7.7 s | ✓ earthquake_search 91% · map · 488 ms | ✓ earthquake_search 94% · map · 514 ms |
| GDP of Germany since 2000 | get-economic-data · line | ✓ get-economic-data 76% · line · 7.9 s | ✓ get-economic-data 100% · 545 ms | ✓ get-economic-data 100% · 607 ms |
| life expectancy in Japan | get-health-data / get-social-data · line | ✗ get-health-data 76% · stat · 7.7 s | ✓ get-health-data 93% · 525 ms | ✓ get-health-data 92% · 534 ms |
| latest papers on small language models | arxiv_search · feed | ✓ arxiv_search 76% · feed · 6.8 s | ✓ arxiv_search 100% · feed · 587 ms | ✓ arxiv_search 100% · feed · 540 ms |
| find arXiv papers about diffusion models | arxiv_search · feed | ✓ arxiv_search 78% · feed · 8.7 s | ✓ arxiv_search 100% · feed · 592 ms | ✓ arxiv_search 100% · feed · 510 ms |
| yeah show it as a table | none · table | ✓ none · table · 5.4 s | ✓ none · table · 247 ms | ✓ none · table · 267 ms |
| bar chart please | none · bar | ✓ none · bar · 5.4 s | ✓ none · bar · 420 ms | ✓ none · bar · 246 ms |
| show it on a map | none · map | ✓ none · map · 5.4 s | ✓ none · map · 609 ms | ✓ none · map · 756 ms |
| as a line graph | none · line | ✓ none · line · 6.5 s | ✓ none · line · 440 ms | ✓ none · line · 285 ms |
| just give me the number | none · stat | ✓ none · stat · 5.4 s | ✓ none · stat · 239 ms | ✓ none · stat · 238 ms |
| what about Tehran? | none / weather_forecast | ✗✗ geocoding 66% · 10.8 s | ✓ none · 608 ms | ✓ ↗ none · 874 ms |
| compare it with ethereum | none / coingecko_get_prices / coingecko_get_market_chart | ✓ coingecko_get_prices 90% · 8.6 s | ✓ none · 525 ms | ✓ ↗ none · 756 ms |
| and for the last year? | none | ✓ none · 6.4 s | ✓ none · 539 ms | ✓ none · 514 ms |
| tell me a joke | none | ✗ none · text · 5.6 s | ✓ none · 294 ms | ✓ none · 274 ms |
| what's the capital of France | none | ✗ none · text · 5.5 s | ✓ none · 506 ms | ✓ none · 611 ms |
| write me a poem about the sea | none | ✗ none · text · 6.5 s | ✓ none · 282 ms | ✓ none · 289 ms |
| hi | none | ✓ none · 5.5 s | ✓ none · 295 ms | ✓ none · 266 ms |

## End-to-end conversation

The same 9 messages in a row through the real engine and MCP sources, with follow-ups referring to the previous tile.

| # | Message | Before: qwen3.8-27b answers | Jev answers | Jev + qwen3.8-27b when unsure |
|---|---|---|---|---|
| 1 | What's the weather in Berlin this week? | ✓ 7.9 s · 4 LLM<br><sub>weather_forecast → line {"latitude":52.52,"longitude":13.405,"daily":["weather_code","temperature_2m_max","temperature_2m_min","apparent_temperature_max","apparent_temperature_min","precipitation_sum","precipitation_probability_max","wind_speed_10m_max","wind_gusts_10m_max","wind_direction_10m_dominant","sunrise","sunset","uv_index_max"],"forecast_days":7}</sub> | ✓ 28.8 s · 1 LLM<br><sub>weather_forecast → line {"latitude":52.52,"longitude":13.405,"daily":["weather_code","temperature_2m_max","temperature_2m_min","apparent_temperature_max","apparent_temperature_min","precipitation_sum","precipitation_probability_max","wind_speed_10m_max","wind_gusts_10m_max","wind_direction_10m_dominant","sunrise","sunset","uv_index_max"],"forecast_days":7}</sub> | ✓ 29.0 s · 1 LLM<br><sub>weather_forecast → line {"latitude":52.52,"longitude":13.405,"daily":["weather_code","temperature_2m_max","temperature_2m_min","apparent_temperature_max","apparent_temperature_min","precipitation_sum","precipitation_probability_max","wind_speed_10m_max","wind_gusts_10m_max","wind_direction_10m_dominant","sunrise","sunset","uv_index_max"],"forecast_days":7}</sub> |
| 2 | show it as a table | ✓ 11.8 s · 2 LLM<br><sub>weather_forecast → table {"latitude":52.52,"longitude":13.405,"daily":["weather_code","temperature_2m_max","temperature_2m_min","apparent_temperature_max","apparent_temperature_min","precipitation_sum","precipitation_probability_max","wind_speed_10m_max","wind_gusts_10m_max","wind_direction_10m_dominant","sunrise","sunset","uv_index_max"],"forecast_days":7}</sub> | ✓ 321 ms · 0 LLM<br><sub>weather_forecast → table {"latitude":52.52,"longitude":13.405,"daily":["weather_code","temperature_2m_max","temperature_2m_min","apparent_temperature_max","apparent_temperature_min","precipitation_sum","precipitation_probability_max","wind_speed_10m_max","wind_gusts_10m_max","wind_direction_10m_dominant","sunrise","sunset","uv_index_max"],"forecast_days":7}</sub> | ✓ 320 ms · 0 LLM<br><sub>weather_forecast → table {"latitude":52.52,"longitude":13.405,"daily":["weather_code","temperature_2m_max","temperature_2m_min","apparent_temperature_max","apparent_temperature_min","precipitation_sum","precipitation_probability_max","wind_speed_10m_max","wind_gusts_10m_max","wind_direction_10m_dominant","sunrise","sunset","uv_index_max"],"forecast_days":7}</sub> |
| 3 | what about Tehran? | ✗ 15.0 s · 3 LLM<br><sub>geocoding → map {"name":"Tehran"}</sub> | ✓ 28.5 s · 1 LLM<br><sub>weather_forecast → table {"latitude":35.6892,"longitude":51.389,"daily":["weather_code","temperature_2m_max","temperature_2m_min","apparent_temperature_max","apparent_temperature_min","precipitation_sum","precipitation_probability_max","wind_speed_10m_max","wind_gusts_10m_max","wind_direction_10m_dominant","sunrise","sunset","uv_index_max"],"forecast_days":7}</sub> | ✓ 31.8 s · 2 LLM<br><sub>weather_forecast → table {"latitude":35.6892,"longitude":51.389,"daily":["weather_code","temperature_2m_max","temperature_2m_min","apparent_temperature_max","apparent_temperature_min","precipitation_sum","precipitation_probability_max","wind_speed_10m_max","wind_gusts_10m_max","wind_direction_10m_dominant","sunrise","sunset","uv_index_max"],"forecast_days":7}</sub> |
| 4 | bitcoin price right now | ✓ 14.2 s · 3 LLM<br><sub>coingecko_get_prices → stat {"ids":["bitcoin"],"vs_currencies":["usd"]}</sub> | ✓ 4.1 s · 1 LLM<br><sub>coingecko_get_prices → stat {"ids":["bitcoin"],"vs_currencies":["usd"]}</sub> | ✓ 3.5 s · 1 LLM<br><sub>coingecko_get_prices → stat {"ids":["bitcoin"],"vs_currencies":["usd"]}</sub> |
| 5 | and ethereum? | ✓ 14.2 s · 3 LLM<br><sub>coingecko_get_prices → stat {"ids":["bitcoin","ethereum"],"vs_currencies":["usd"]}</sub> | ✓ 4.7 s · 1 LLM<br><sub>coingecko_get_prices → stat {"ids":["bitcoin","ethereum"],"vs_currencies":["usd"]}</sub> | ✓ 7.4 s · 2 LLM<br><sub>coingecko_get_prices → stat {"ids":["bitcoin","ethereum"],"vs_currencies":["usd"]}</sub> |
| 6 | bitcoin price over the last 30 days | ✓ 15.3 s · 3 LLM<br><sub>coingecko_get_market_chart → line {"id":"bitcoin","mode":"recent","days":30}</sub> | ✓ 5.0 s · 1 LLM<br><sub>coingecko_get_market_chart → line {"id":"bitcoin","mode":"recent","days":30}</sub> | ✓ 6.2 s · 1 LLM<br><sub>coingecko_get_market_chart → line {"id":"bitcoin","mode":"recent","days":30}</sub> |
| 7 | top stories on Hacker News | ✓ 11.2 s · 3 LLM<br><sub>getTopStories → feed {}</sub> | ✓ 1.7 s · 1 LLM<br><sub>getTopStories → feed {}</sub> | ✓ 3.0 s · 1 LLM<br><sub>getTopStories → feed {}</sub> |
| 8 | as a table | ✓ 8.6 s · 2 LLM<br><sub>getTopStories → table {}</sub> | ✓ 267 ms · 0 LLM<br><sub>getTopStories → table {}</sub> | ✓ 347 ms · 0 LLM<br><sub>getTopStories → table {}</sub> |
| 9 | tell me a joke | ✗ 5.6 s · 1 LLM<br><sub>getTopStories → feed {}</sub> | ✓ 284 ms · 0 LLM<br><sub>said: not a data request</sub> | ✓ 353 ms · 0 LLM<br><sub>said: not a data request</sub> |
| | **Total** | **103.8 s · 24 LLM calls** | **73.8 s · 6 LLM calls** | **82.0 s · 8 LLM calls** |

## Method

- 38 hand-labelled messages (`scripts/cases.ts`): 26 direct requests across 51 tools, 8 follow-ups that only make sense with a previous tile, 4 off-topic messages. Some accept more than one answer (e.g. "compare it with Nvidia" may name the stock tool or defer to the current tile).
- Each variant is warmed up once (model loading not timed), then routes every message once. Both models run at temperature 0.
- The LLM's confidence is self-reported; Jev's is a calibrated probability.
- Wall-clock times on one machine with both models loaded. The conversation includes real API calls (Open-Meteo, Yahoo Finance, CoinGecko), identical for every variant.
- Small test set: treat differences of one or two messages as noise.
