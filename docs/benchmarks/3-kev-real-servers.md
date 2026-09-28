# Benchmark: routing with and without Kev (System One)

ColdHarbor turns a message into *which tool* and *which widget*, then an LLM fills in the tool's arguments. This compares three ways to answer those quick questions:

- **Before:** qwen3.5 (a local qwen3.5:latest via ollama) answers the quick questions for every message: which tool, which view, is it a follow-up, did it make a value up?
- **Kev:** [Kev](https://github.com/jaredpalmer/kev)'s System One model answers them; qwen3.5 only fills in arguments, and is skipped when a message only changes the view.
- **Kev + qwen3.5 (hybrid, the default):** Kev answers them, and qwen3.5 chooses from Kev's shortlist only when Kev is unsure which tool is meant. View requests always come from Kev.

All three get exactly the same questions, with the same options.

Everything else is identical: the engine, the thresholds (act on a tool at ≥ 55.00000000000001%, treat a view request as explicit at ≥ 75%), the MCP sources and the widgets.

Run on 2026-09-28 · Apple M4 · 16 GB RAM · Kev `jaredpalmer/kev-0.8b` (mlx bfloat16) · 36 tools from 3 MCP servers · 9 widgets.
Reproduce with `pnpm bench` (needs Kev on http://127.0.0.1:8009 and the LLM running). Raw numbers: `docs/benchmark.json`.

## Summary

| | Before: qwen3.5 answers | Kev answers | Kev + qwen3.5 when unsure |
|---|---|---|---|
| **Routing: tool and view both right** | **19/32 (59%)** | **12/32 (38%)** | **26/32 (81%)** |
| Routing: right tool | 24/32 (75%) | 12/32 (38%) | 26/32 (81%) |
| Routing: right view request | 26/32 (81%) | 31/32 (97%) | 31/32 (97%) |
| Confidently wrong (fetched the wrong source) | 2 | 0 | 1 |
| **Routing time, median** | **19.1 s** | **4.5 s** (4.2× faster) | **13.2 s** (1.5× faster) |
| Routing time, p95 | 24.6 s | 20.7 s | 50.8 s |
| Messages sent to the LLM for routing | 32/32 | 0/32 | 27/32 |
| **Conversation (9 turns): right** | **2/9** | **0/9** | **8/9** |
| **Conversation: total time** | **345.1 s** | **128.2 s** (2.7× faster) | **361.3 s** (1.0× faster) |
| Conversation: LLM calls | 25 | 0 | 14 |

"Confidently wrong" is the error that matters most: System One was sure enough to act, and ColdHarbor fetched and drew the wrong data.
When it isn't sure, ColdHarbor asks you instead, which costs a click, not a wrong answer.

## By kind of message (tool and view both right)

| Kind | Before: qwen3.5 answers | Kev answers | Kev + qwen3.5 when unsure |
|---|---|---|---|
| direct (20) | 10/20 | 0/20 | 14/20 |
| follow-up (8) | 8/8 | 8/8 | 8/8 |
| off-topic (4) | 1/4 | 4/4 | 4/4 |

## Every routing decision

✓ right · ✗ wrong but safe (ColdHarbor asks, or keeps the current tile) · ✗✗ confidently wrong · ↗ escalated to qwen3.5

| Message | Expected | Before: qwen3.5 answers | Kev answers | Kev + qwen3.5 when unsure |
|---|---|---|---|---|
| What's the weather in Berlin this week? | weather_forecast | ✗✗ gfs_forecast 64% · 15.4 s | ✗ none · 4.5 s | ✓ ↗ weather_forecast 80% · 28.0 s |
| will it rain in London tomorrow? | weather_forecast | ✗ none · text · 16.4 s | ✗ none · 3.1 s | ✗ ↗ none · 7.7 s |
| how cold will it get in Oslo this weekend | weather_forecast | ✗ weather_forecast 64% · text · 15.8 s | ✗ none · 4.1 s | ✗ ↗ none · 5.8 s |
| temperature in Tokyo for the next 10 days as a line chart | weather_forecast · line | ✗✗ ecmwf_forecast 76% · line · 17.3 s | ✗ none · line · 3.3 s | ✗ ↗ none · line · 7.3 s |
| weather in Paris as a table | weather_forecast · table | ✓ weather_forecast 80% · table · 17.5 s | ✗ none · 3.2 s | ✗ ↗ none · 6.5 s |
| how warm was it in Rome last month? | weather_archive / weather_forecast · line | ✗ none · line · 19.7 s | ✗ none · 3.0 s | ✓ ↗ weather_archive 80% · 6.9 s |
| air quality in Delhi today | air_quality | ✓ air_quality 64% · 22.6 s | ✗ none · 3.1 s | ✓ ↗ air_quality 100% · 7.8 s |
| bitcoin price right now | coingecko_get_prices · stat | ✗ none · stat · 21.7 s | ✗ none · 10.8 s | ✓ ↗ coingecko_get_prices 100% · 11.6 s |
| how much is one dogecoin worth | coingecko_get_prices · stat | ✗ none · stat · 22.7 s | ✗ none · 4.7 s | ✓ ↗ coingecko_get_prices 100% · 9.3 s |
| bitcoin price over the last 30 days | coingecko_get_market_chart · line | ✗ none · line · 24.4 s | ✗ none · line · 4.7 s | ✓ ↗ coingecko_get_market_chart 100% · line · 13.0 s |
| which coins are trending right now? | coingecko_get_trending · table | ✗ coingecko_get_trending 64% · feed · 23.1 s | ✗ none · 3.6 s | ✓ ↗ coingecko_get_trending 100% · 11.8 s |
| top 10 cryptocurrencies by market cap | coingecko_list_markets · table | ✓ coingecko_list_markets 80% · table · 25.5 s | ✗ none · 8.2 s | ✓ ↗ coingecko_list_markets 100% · 16.1 s |
| how big is the whole crypto market? | coingecko_get_global / coingecko_list_markets · stat | ✗ none · stat · 24.6 s | ✗ none · 2.5 s | ✗ ↗ none · 16.7 s |
| top stories on Hacker News | getTopStories · feed | ✓ getTopStories 64% · feed · 21.2 s | ✗ none · feed · 4.4 s | ✓ ↗ getTopStories 100% · feed · 13.2 s |
| latest Show HN posts | getShowHNStories · feed | ✓ getShowHNStories 64% · feed · 20.2 s | ✗ none · 2.8 s | ✓ ↗ getShowHNStories 100% · 10.9 s |
| what are people asking on Ask HN? | getAskHNStories · feed | ✓ getAskHNStories 64% · feed · 20.5 s | ✗ none · 3.3 s | ✓ ↗ getAskHNStories 80% · 9.8 s |
| newest Hacker News submissions | getNewStories · feed | ✓ getNewStories 80% · feed · 20.1 s | ✗ none · 3.0 s | ✓ ↗ getNewStories 100% · 16.0 s |
| Hacker News job postings | getJobStories · feed | ✓ getJobStories 64% · feed · 19.1 s | ✗ none · 3.3 s | ✓ ↗ getJobStories 100% · 10.6 s |
| best Hacker News stories as a table | getBestStories · table | ✓ getBestStories 64% · table · 19.3 s | ✗ none · table · 7.5 s | ✓ ↗ getBestStories 100% · table · 13.7 s |
| bar chart of the top Hacker News stories by score | getTopStories · bar | ✓ getTopStories 64% · bar · 20.4 s | ✗ none · bar · 12.2 s | ✗✗ ↗ getBestStories 95% · bar · 13.6 s |
| yeah show it as a table | none · table | ✓ none · table · 14.8 s | ✓ none · table · 3.3 s | ✓ none · table · 11.0 s |
| bar chart please | none · bar | ✓ none · bar · 14.8 s | ✓ none · bar · 21.6 s | ✓ none · bar · 11.6 s |
| show it on a map | none · map | ✓ none · map · 14.9 s | ✓ none · map · 12.0 s | ✓ none · map · 7.6 s |
| as a line graph | none · line | ✓ none · line · 14.9 s | ✓ none · line · 3.7 s | ✓ none · line · 14.8 s |
| just give me the number | none · stat | ✓ none · stat · 14.7 s | ✓ none · 4.8 s | ✓ ↗ none · 15.6 s |
| what about Tehran? | none / weather_forecast | ✓ none · 14.9 s | ✓ none · 13.2 s | ✓ ↗ none · 50.8 s |
| compare it with ethereum | none / coingecko_get_prices / coingecko_get_market_chart | ✓ none · 22.2 s | ✓ none · 7.5 s | ✓ ↗ coingecko_get_market_chart 85% · 53.7 s |
| and for the last year? | none | ✓ none · 14.8 s | ✓ none · 8.7 s | ✓ ↗ none · 36.7 s |
| tell me a joke | none | ✗ none · text · 14.8 s | ✓ none · 20.7 s | ✓ ↗ none · 33.1 s |
| what's the capital of France | none | ✗ none · text · 14.9 s | ✓ none · 10.9 s | ✓ ↗ none · 36.9 s |
| write me a poem about the sea | none | ✗ none · text · 15.1 s | ✓ none · 2.5 s | ✓ none · 19.1 s |
| hi | none | ✓ none · 14.9 s | ✓ none · 10.2 s | ✓ ↗ none · 14.7 s |

## End-to-end conversation

The same 9 messages in a row through the real engine and MCP sources, with follow-ups referring to the previous tile.

| # | Message | Before: qwen3.5 answers | Kev answers | Kev + qwen3.5 when unsure |
|---|---|---|---|---|
| 1 | What's the weather in Berlin this week? | ✗ 57.6 s · 3 LLM<br><sub>gfs_forecast → line {"latitude":52.52,"longitude":13.405,"hourly":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"current":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"forecast_days":7,"models":"ncep_gfs_global"}</sub> | ✗ 32.1 s · 0 LLM<br><sub>asked: weather.weather_forecast / weather.dwd_icon_forecast…</sub> | ✓ 62.8 s · 3 LLM<br><sub>weather_forecast → line {"latitude":52.52,"longitude":13.405,"hourly":["temperature_2m","weather_code","precipitation_probability","wind_speed_10m"],"daily":["weather_code","temperature_2m_max","temperature_2m_min","precipitation_sum","sunshine_duration"],"current_weather":true,"temperature_unit":"celsius","wind_speed_unit":"kmh","precipitation_unit":"mm","timezone":"Europe/Berlin","forecast_days":7}</sub> |
| 2 | show it as a table | ✗ 25.8 s · 2 LLM<br><sub>gfs_forecast → table {"latitude":52.52,"longitude":13.405,"hourly":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"current":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"forecast_days":7,"models":"ncep_gfs_global"}</sub> | ✗ 6.6 s · 0 LLM<br><sub>asked: hackernews.getShowHNStories / weather.meteofrance_forecast…</sub> | ✓ 22.7 s · 0 LLM<br><sub>weather_forecast → table {"latitude":52.52,"longitude":13.405,"hourly":["temperature_2m","weather_code","precipitation_probability","wind_speed_10m"],"daily":["weather_code","temperature_2m_max","temperature_2m_min","precipitation_sum","sunshine_duration"],"current_weather":true,"temperature_unit":"celsius","wind_speed_unit":"kmh","precipitation_unit":"mm","timezone":"Europe/Berlin","forecast_days":7}</sub> |
| 3 | what about Tehran? | ✗ 59.4 s · 3 LLM<br><sub>gfs_forecast → table {"latitude":35.6892,"longitude":51.389,"hourly":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"current":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"forecast_days":7,"models":"ncep_gfs_global"}</sub> | ✗ 2.6 s · 0 LLM<br><sub>asked: weather.geocoding / weather.meteofrance_forecast…</sub> | ✗ 15.7 s · 2 LLM<br><sub>geocoding → map {"name":"Tehran"}</sub> |
| 4 | bitcoin price right now | ✗ 34.2 s · 2 LLM<br><sub>gfs_forecast → line {"latitude":35.6892,"longitude":51.389,"hourly":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"current":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"forecast_days":7,"models":"ncep_gfs_global"}</sub> | ✗ 8.1 s · 0 LLM<br><sub>asked: crypto.coingecko_get_prices / crypto.coingecko_get_trending…</sub> | ✓ 31.8 s · 2 LLM<br><sub>coingecko_get_prices → stat {"ids":["bitcoin"],"vs_currencies":["usd"]}</sub> |
| 5 | and ethereum? | ✗ 44.8 s · 3 LLM<br><sub>gfs_forecast → line {"latitude":35.6892,"longitude":51.389,"hourly":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"current":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"forecast_days":7,"models":"ncep_gfs_global"}</sub> | ✗ 21.4 s · 0 LLM<br><sub>asked: crypto.coingecko_get_trending / crypto.coingecko_list_markets…</sub> | ✓ 71.2 s · 2 LLM<br><sub>coingecko_get_prices → stat {"ids":["bitcoin","ethereum"],"vs_currencies":["usd"]}</sub> |
| 6 | bitcoin price over the last 30 days | ✗ 43.7 s · 3 LLM<br><sub>gfs_forecast → line {"latitude":35.6892,"longitude":51.389,"hourly":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"current":["temperature_2m","weather_code","wind_speed_10m","precipitation_probability"],"forecast_days":7,"models":"ncep_gfs_global"}</sub> | ✗ 36.6 s · 0 LLM<br><sub>asked: crypto.coingecko_get_market_chart / crypto.coingecko_get_prices…</sub> | ✓ 48.8 s · 2 LLM<br><sub>coingecko_get_market_chart → line {"id":"bitcoin","vs_currency":"usd","mode":"recent","days":30}</sub> |
| 7 | top stories on Hacker News | ✓ 26.4 s · 3 LLM<br><sub>getTopStories → feed {"limit":10}</sub> | ✗ 7.4 s · 0 LLM<br><sub>asked: hackernews.getTopStories / hackernews.getBestStories…</sub> | ✓ 43.0 s · 2 LLM<br><sub>getTopStories → feed {"limit":10}</sub> |
| 8 | as a table | ✓ 33.5 s · 5 LLM<br><sub>getTopStories → table {"limit":10}</sub> | ✗ 10.6 s · 0 LLM<br><sub>asked: weather.meteofrance_forecast / weather.ecmwf_forecast…</sub> | ✓ 32.6 s · 0 LLM<br><sub>getTopStories → table {"limit":10}</sub> |
| 9 | tell me a joke | ✗ 19.6 s · 1 LLM<br><sub>getTopStories → feed {"limit":10}</sub> | ✗ 2.7 s · 0 LLM<br><sub>asked: hackernews.getAskHNStories / hackernews.getItem…</sub> | ✓ 32.7 s · 1 LLM<br><sub>said: not a data request</sub> |
| | **Total** | **345.1 s · 25 LLM calls** | **128.2 s · 0 LLM calls** | **361.3 s · 14 LLM calls** |

## Method

- 32 hand-labelled messages (`scripts/cases.ts`): 20 direct requests across 36 tools, 8 follow-ups that only make sense with a previous tile, 4 off-topic messages. Some accept more than one answer (e.g. "compare it with Nvidia" may name the stock tool or defer to the current tile).
- Each variant is warmed up once (model loading not timed), then routes every message once. Both models run at temperature 0.
- The LLM's confidence is self-reported; Kev's is a calibrated probability.
- Wall-clock times on one machine with both models loaded. The conversation includes real API calls (Open-Meteo, Yahoo Finance, CoinGecko), identical for every variant.
- Small test set: treat differences of one or two messages as noise.
