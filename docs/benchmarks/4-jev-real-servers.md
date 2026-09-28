# Benchmark: routing with and without Jev (System One)

ColdHarbor turns a message into *which tool* and *which widget*, then an LLM fills in the tool's arguments. This compares three ways to answer those quick questions:

- **Before:** qwen3.5 (a local qwen3.5:latest via ollama) answers the quick questions for every message: which tool, which view, is it a follow-up, did it make a value up?
- **Jev:** the System One model (`jev-latest` at https://api.typesafe.ai) answers them; qwen3.5 only fills in arguments, and is skipped when a message only changes the view.
- **Jev + qwen3.5 (hybrid, the default):** Jev answers them, and qwen3.5 chooses from Jev's shortlist only when Jev is unsure which tool is meant. View requests always come from Jev.

All three get exactly the same questions, with the same options.

Everything else is identical: the engine, the thresholds (act on a tool at ≥ 55.00000000000001%, treat a view request as explicit at ≥ 75%), the MCP sources and the widgets.

Run on 2026-09-28 · Apple M4 · 16 GB RAM · Jev `jev-latest` (? ) · 36 tools from 3 MCP servers · 9 widgets.
Reproduce with `pnpm bench` (needs Jev at https://api.typesafe.ai and the LLM running). Raw numbers: `docs/benchmark.json`.

## Summary

| | Before: qwen3.5 answers | Jev answers | Jev + qwen3.5 when unsure |
|---|---|---|---|
| **Routing: tool and view both right** | **24/32 (75%)** | **22/32 (69%)** | **23/32 (72%)** |
| Routing: right tool | 30/32 (94%) | 29/32 (91%) | 29/32 (91%) |
| Routing: right view request | 26/32 (81%) | 24/32 (75%) | 25/32 (78%) |
| Confidently wrong (fetched the wrong source) | 2 | 1 | 2 |
| **Routing time, median** | **22.8 s** | **511 ms** (44.6× faster) | **557 ms** (40.9× faster) |
| Routing time, p95 | 26.3 s | 664 ms | 5.5 s |
| Messages sent to the LLM for routing | 32/32 | 0/32 | 5/32 |
| **Conversation (9 turns): right** | **5/9** | **6/9** | **6/9** |
| **Conversation: total time** | **273.4 s** | **88.4 s** (3.1× faster) | **81.8 s** (3.3× faster) |
| Conversation: LLM calls | 26 | 7 | 9 |

"Confidently wrong" is the error that matters most: System One was sure enough to act, and ColdHarbor fetched and drew the wrong data.
When it isn't sure, ColdHarbor asks you instead, which costs a click, not a wrong answer.

## By kind of message (tool and view both right)

| Kind | Before: qwen3.5 answers | Jev answers | Jev + qwen3.5 when unsure |
|---|---|---|---|
| direct (20) | 15/20 | 11/20 | 13/20 |
| follow-up (8) | 8/8 | 8/8 | 7/8 |
| off-topic (4) | 1/4 | 3/4 | 3/4 |

## Every routing decision

✓ right · ✗ wrong but safe (ColdHarbor asks, or keeps the current tile) · ✗✗ confidently wrong · ↗ escalated to qwen3.5

| Message | Expected | Before: qwen3.5 answers | Jev answers | Jev + qwen3.5 when unsure |
|---|---|---|---|---|
| What's the weather in Berlin this week? | weather_forecast | ✗✗ gfs_forecast 64% · 23.8 s | ✓ weather_forecast 77% · 465 ms | ✓ weather_forecast 77% · 598 ms |
| will it rain in London tomorrow? | weather_forecast | ✗ weather_forecast 80% · text · 25.1 s | ✗ weather_forecast 96% · detail · 554 ms | ✓ weather_forecast 97% · 470 ms |
| how cold will it get in Oslo this weekend | weather_forecast | ✗ weather_forecast 64% · text · 22.8 s | ✗✗ metno_forecast 83% · detail · 548 ms | ✗✗ metno_forecast 88% · detail · 557 ms |
| temperature in Tokyo for the next 10 days as a line chart | weather_forecast · line | ✗✗ ecmwf_forecast 76% · line · 24.9 s | ✗ none · line · 664 ms | ✗✗ jma_forecast 56% · line · 509 ms |
| weather in Paris as a table | weather_forecast · table | ✓ weather_forecast 80% · table · 26.3 s | ✗ none · table · 584 ms | ✗ ↗ none · table · 5.0 s |
| how warm was it in Rome last month? | weather_archive / weather_forecast · line | ✓ weather_archive 76% · line · 24.9 s | ✗ weather_archive 100% · detail · 490 ms | ✗ weather_archive 100% · detail · 565 ms |
| air quality in Delhi today | air_quality | ✓ air_quality 64% · 24.7 s | ✗ air_quality 100% · detail · 561 ms | ✗ air_quality 100% · detail · 543 ms |
| bitcoin price right now | coingecko_get_prices · stat | ✓ coingecko_get_prices 80% · stat · 25.7 s | ✗ coingecko_get_prices 100% · detail · 514 ms | ✗ coingecko_get_prices 100% · detail · 465 ms |
| how much is one dogecoin worth | coingecko_get_prices · stat | ✓ coingecko_get_prices 80% · stat · 25.5 s | ✗ coingecko_get_prices 99% · detail · 571 ms | ✗ coingecko_get_prices 100% · detail · 595 ms |
| bitcoin price over the last 30 days | coingecko_get_market_chart · line | ✓ coingecko_get_market_chart 80% · line · 25.7 s | ✗ coingecko_get_market_chart 100% · detail · 502 ms | ✓ coingecko_get_market_chart 100% · line · 465 ms |
| which coins are trending right now? | coingecko_get_trending · table | ✗ coingecko_get_trending 64% · feed · 25.3 s | ✓ coingecko_get_trending 100% · 553 ms | ✓ coingecko_get_trending 100% · 576 ms |
| top 10 cryptocurrencies by market cap | coingecko_list_markets · table | ✓ coingecko_list_markets 80% · table · 24.1 s | ✓ coingecko_list_markets 100% · 568 ms | ✓ coingecko_list_markets 100% · 632 ms |
| how big is the whole crypto market? | coingecko_get_global / coingecko_list_markets · stat | ✓ coingecko_get_global 80% · stat · 24.3 s | ✓ coingecko_get_global 100% · stat · 494 ms | ✓ coingecko_get_global 100% · stat · 503 ms |
| top stories on Hacker News | getTopStories · feed | ✓ getTopStories 64% · feed · 21.4 s | ✓ getTopStories 100% · feed · 538 ms | ✓ getTopStories 100% · feed · 569 ms |
| latest Show HN posts | getShowHNStories · feed | ✓ getShowHNStories 64% · feed · 21.6 s | ✓ getShowHNStories 97% · feed · 483 ms | ✓ getShowHNStories 98% · feed · 548 ms |
| what are people asking on Ask HN? | getAskHNStories · feed | ✓ getAskHNStories 64% · feed · 24.4 s | ✓ getAskHNStories 100% · 500 ms | ✓ getAskHNStories 99% · 567 ms |
| newest Hacker News submissions | getNewStories · feed | ✓ getNewStories 80% · feed · 23.4 s | ✓ getNewStories 100% · feed · 487 ms | ✓ getNewStories 100% · feed · 453 ms |
| Hacker News job postings | getJobStories · feed | ✓ getJobStories 64% · feed · 21.2 s | ✓ getJobStories 100% · 546 ms | ✓ getJobStories 100% · 638 ms |
| best Hacker News stories as a table | getBestStories · table | ✓ getBestStories 64% · table · 22.0 s | ✓ getBestStories 100% · table · 485 ms | ✓ getBestStories 100% · table · 525 ms |
| bar chart of the top Hacker News stories by score | getTopStories · bar | ✓ getTopStories 64% · bar · 22.3 s | ✓ getTopStories 94% · bar · 511 ms | ✓ getTopStories 94% · bar · 649 ms |
| yeah show it as a table | none · table | ✓ none · table · 16.5 s | ✓ none · table · 285 ms | ✓ none · table · 241 ms |
| bar chart please | none · bar | ✓ none · bar · 15.6 s | ✓ none · bar · 264 ms | ✓ none · bar · 287 ms |
| show it on a map | none · map | ✓ none · map · 16.3 s | ✓ none · map · 521 ms | ✓ none · map · 588 ms |
| as a line graph | none · line | ✓ none · line · 16.9 s | ✓ none · line · 550 ms | ✓ ↗ none · line · 5.5 s |
| just give me the number | none · stat | ✓ none · stat · 17.3 s | ✓ none · stat · 286 ms | ✓ none · stat · 335 ms |
| what about Tehran? | none / weather_forecast | ✓ none · 15.7 s | ✓ none · 579 ms | ✗ ↗ none · detail · 4.0 s |
| compare it with ethereum | none / coingecko_get_prices / coingecko_get_market_chart | ✓ coingecko_get_prices 76% · 26.3 s | ✓ none · 496 ms | ✓ ↗ coingecko_get_prices 80% · 5.5 s |
| and for the last year? | none | ✓ none · 16.2 s | ✓ none · 739 ms | ✓ ↗ none · 4.1 s |
| tell me a joke | none | ✗ none · text · 16.0 s | ✓ none · 306 ms | ✓ none · 296 ms |
| what's the capital of France | none | ✗ none · text · 15.5 s | ✗ none · detail · 293 ms | ✗ none · detail · 257 ms |
| write me a poem about the sea | none | ✗ none · text · 16.2 s | ✓ none · 418 ms | ✓ none · 363 ms |
| hi | none | ✓ none · 15.7 s | ✓ none · 307 ms | ✓ none · 238 ms |

## End-to-end conversation

The same 9 messages in a row through the real engine and MCP sources, with follow-ups referring to the previous tile.

| # | Message | Before: qwen3.5 answers | Jev answers | Jev + qwen3.5 when unsure |
|---|---|---|---|---|
| 1 | What's the weather in Berlin this week? | ✗ 34.9 s · 3 LLM<br><sub>gfs_forecast → line {"latitude":52.52,"longitude":13.405,"hourly":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"current":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"forecast_days":7,"models":"ncep_gfs_global"}</sub> | ✓ 43.1 s · 2 LLM<br><sub>weather_forecast → line {"latitude":52.52,"longitude":13.405,"hourly":["temperature_2m","weather_code","precipitation_probability","wind_speed_10m"],"daily":["weather_code","temperature_2m_max","temperature_2m_min","precipitation_sum","sunshine_duration"],"current_weather":true,"temperature_unit":"celsius","wind_speed_unit":"kmh","precipitation_unit":"mm","timezone":"Europe/Berlin","forecast_days":7}</sub> | ✓ 39.3 s · 2 LLM<br><sub>weather_forecast → line {"latitude":52.52,"longitude":13.405,"hourly":["temperature_2m","weather_code","precipitation_probability","wind_speed_10m"],"daily":["weather_code","temperature_2m_max","temperature_2m_min","precipitation_sum","sunshine_duration"],"current_weather":true,"temperature_unit":"celsius","wind_speed_unit":"kmh","precipitation_unit":"mm","timezone":"Europe/Berlin","forecast_days":7}</sub> |
| 2 | show it as a table | ✗ 27.2 s · 2 LLM<br><sub>gfs_forecast → table {"latitude":52.52,"longitude":13.405,"hourly":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"current":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"forecast_days":7,"models":"ncep_gfs_global"}</sub> | ✓ 332 ms · 0 LLM<br><sub>weather_forecast → table {"latitude":52.52,"longitude":13.405,"hourly":["temperature_2m","weather_code","precipitation_probability","wind_speed_10m"],"daily":["weather_code","temperature_2m_max","temperature_2m_min","precipitation_sum","sunshine_duration"],"current_weather":true,"temperature_unit":"celsius","wind_speed_unit":"kmh","precipitation_unit":"mm","timezone":"Europe/Berlin","forecast_days":7}</sub> | ✓ 367 ms · 0 LLM<br><sub>weather_forecast → table {"latitude":52.52,"longitude":13.405,"hourly":["temperature_2m","weather_code","precipitation_probability","wind_speed_10m"],"daily":["weather_code","temperature_2m_max","temperature_2m_min","precipitation_sum","sunshine_duration"],"current_weather":true,"temperature_unit":"celsius","wind_speed_unit":"kmh","precipitation_unit":"mm","timezone":"Europe/Berlin","forecast_days":7}</sub> |
| 3 | what about Tehran? | ✗ 29.8 s · 3 LLM<br><sub>geocoding → map {"name":"Tehran"}</sub> | ✗ 16.8 s · 1 LLM<br><sub>weather_forecast → line {"latitude":35.6892,"longitude":51.389,"hourly":["temperature_2m","weather_code","precipitation_probability","wind_speed_10m"],"daily":["weather_code","temperature_2m_max","temperature_2m_min","precipitation_sum","sunshine_duration"],"current_weather":true,"temperature_unit":"celsius","wind_speed_unit":"kmh","precipitation_unit":"mm","timezone":"Asia/Tehran","forecast_days":7}</sub> | ✗ 9.1 s · 2 LLM<br><sub>geocoding → map {"name":"Tehran"}</sub> |
| 4 | bitcoin price right now | ✓ 36.8 s · 3 LLM<br><sub>coingecko_get_prices → stat {"ids":["bitcoin"],"vs_currencies":["usd"]}</sub> | ✗ 9.0 s · 1 LLM<br><sub>coingecko_get_prices → detail {"ids":["bitcoin"],"vs_currencies":["usd"]}</sub> | ✗ 9.0 s · 1 LLM<br><sub>coingecko_get_prices → detail {"ids":["bitcoin"],"vs_currencies":["usd"]}</sub> |
| 5 | and ethereum? | ✓ 38.7 s · 3 LLM<br><sub>coingecko_get_prices → stat {"ids":["bitcoin","ethereum"],"vs_currencies":["usd"]}</sub> | ✗ 8.5 s · 1 LLM<br><sub>coingecko_get_prices → bar {"ids":["bitcoin","ethereum"],"vs_currencies":["usd"]}</sub> | ✗ 17.6 s · 2 LLM<br><sub>coingecko_get_prices → bar {"ids":["bitcoin","ethereum"],"vs_currencies":["usd"]}</sub> |
| 6 | bitcoin price over the last 30 days | ✓ 31.5 s · 3 LLM<br><sub>coingecko_get_market_chart → line {"id":"bitcoin","vs_currency":"usd","mode":"recent","days":30}</sub> | ✓ 4.7 s · 1 LLM<br><sub>coingecko_get_market_chart → line {"id":"bitcoin","vs_currency":"usd","mode":"recent","days":30}</sub> | ✓ 4.5 s · 1 LLM<br><sub>coingecko_get_market_chart → line {"id":"bitcoin","vs_currency":"usd","mode":"recent","days":30}</sub> |
| 7 | top stories on Hacker News | ✓ 27.5 s · 3 LLM<br><sub>getTopStories → feed {"limit":10}</sub> | ✓ 5.3 s · 1 LLM<br><sub>getTopStories → feed {"limit":10}</sub> | ✓ 1.4 s · 1 LLM<br><sub>getTopStories → feed {"limit":10}</sub> |
| 8 | as a table | ✓ 29.8 s · 5 LLM<br><sub>getTopStories → table {"limit":10}</sub> | ✓ 341 ms · 0 LLM<br><sub>getTopStories → table {"limit":10}</sub> | ✓ 345 ms · 0 LLM<br><sub>getTopStories → table {"limit":10}</sub> |
| 9 | tell me a joke | ✗ 17.2 s · 1 LLM<br><sub>getTopStories → feed {"limit":10}</sub> | ✓ 380 ms · 0 LLM<br><sub>said: not a data request</sub> | ✓ 268 ms · 0 LLM<br><sub>said: not a data request</sub> |
| | **Total** | **273.4 s · 26 LLM calls** | **88.4 s · 7 LLM calls** | **81.8 s · 9 LLM calls** |

## Method

- 32 hand-labelled messages (`scripts/cases.ts`): 20 direct requests across 36 tools, 8 follow-ups that only make sense with a previous tile, 4 off-topic messages. Some accept more than one answer (e.g. "compare it with Nvidia" may name the stock tool or defer to the current tile).
- Each variant is warmed up once (model loading not timed), then routes every message once. Both models run at temperature 0.
- The LLM's confidence is self-reported; Jev's is a calibrated probability.
- Wall-clock times on one machine with both models loaded. The conversation includes real API calls (Open-Meteo, Yahoo Finance, CoinGecko), identical for every variant.
- Small test set: treat differences of one or two messages as noise.
