#!/usr/bin/env node
import { day, defineSource, tool, getJson, z, type Frame } from "@glance/source-kit";

interface Series { name: string; label: string; unit: string; points: [string, number][]; now?: number }

/** Wide time series (one column per symbol) plus a "latest" frame for number cards. */
function frames(list: Series[], title: string, subtitle: string): Frame[] {
  const dates = [...new Set(list.flatMap((s) => s.points.map((p) => p[0])))].sort();
  const maps = list.map((s) => new Map(s.points));
  const series: Frame = {
    title, subtitle,
    fields: [{ name: "date", type: "time" }, ...list.map((s) => ({ name: s.name, type: "number" as const, unit: s.unit }))],
    rows: dates.map((d) => ({ date: d, ...Object.fromEntries(list.map((s, i) => [s.name, maps[i].get(d) ?? null])) })),
    prefer: ["line", "table"],
  };
  const latest: Frame = {
    title: `${title} · latest`, subtitle,
    fields: [{ name: "name", type: "string" }, { name: "price", type: "number" }, { name: "change", type: "number", unit: "%", label: "change over period" }, { name: "unit", type: "string" }],
    rows: list.map((s) => {
      const vals = s.points.map((p) => p[1]);
      const last = s.now ?? vals.at(-1) ?? null;
      return { name: s.label, price: last, change: vals.length > 1 && last != null ? +(((last - vals[0]) / vals[0]) * 100).toFixed(2) : null, unit: s.unit };
    }),
    labelField: "name",
    prefer: ["stat"],
  };
  return [series, latest];
}

const RANGES = { "5d": "1d", "1mo": "1d", "3mo": "1d", "6mo": "1d", "1y": "1d", "5y": "1wk" } as const;

defineSource({
  name: "markets",
  tools: {
    stock_prices: tool({
      title: "Stock prices",
      description: "Share prices of companies on the stock market, by ticker (AAPL, TSLA, NVDA…). E.g. \"how has Apple done this year?\", \"compare Tesla and Nvidia\".",
      input: {
        symbols: z.array(z.string()).min(1).max(5).describe('Stock tickers, e.g. ["AAPL", "NVDA"]. Convert company names to tickers.'),
        range: z.enum(["5d", "1mo", "3mo", "6mo", "1y", "5y"]).default("1mo").describe("Time range"),
      },
      async run({ symbols, range }) {
        const list = await Promise.all(symbols.map(async (sym: string): Promise<Series> => {
          type Chart = { chart: { result?: { meta: Record<string, string | number>; timestamp: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] } };
          const r = (await getJson<Chart>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym.toUpperCase())}?range=${range}&interval=${RANGES[range as keyof typeof RANGES]}`,
            { headers: { "user-agent": "Mozilla/5.0" } })).chart.result?.[0];
          if (!r) throw new Error(`Unknown ticker ${sym}`);
          const closes = r.indicators.quote[0].close;
          return {
            name: String(r.meta.symbol), label: String(r.meta.longName ?? r.meta.shortName ?? r.meta.symbol), unit: String(r.meta.currency ?? "USD"),
            points: r.timestamp.map((t, i) => [day(t * 1000), closes[i]] as [string, number | null]).filter((p): p is [string, number] => p[1] != null).map(([d, v]) => [d, +v.toFixed(2)]),
            now: Number(r.meta.regularMarketPrice) || undefined,
          };
        }));
        return frames(list, `${list.map((s) => s.label).join(" vs ")} · ${range}`, "Yahoo Finance daily close");
      },
    }),
    crypto_prices: tool({
      title: "Crypto prices",
      description: "Cryptocurrency prices in USD (bitcoin, ethereum, solana, dogecoin…). E.g. \"bitcoin price right now\", \"ETH vs SOL this month\".",
      input: {
        coins: z.array(z.string()).min(1).max(5).describe('CoinGecko coin ids, e.g. ["bitcoin", "ethereum", "solana"]'),
        days: z.number().int().min(1).max(365).default(30).describe("How many days of history"),
      },
      async run({ coins, days }) {
        const list = await Promise.all(coins.map(async (c: string): Promise<Series> => {
          const id = c.toLowerCase();
          const j = await getJson<{ prices: [number, number][] }>(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=daily`)
            .catch(() => { throw new Error(`CoinGecko doesn't know "${c}" (or is rate-limiting; try again in a minute)`); });
          const byDay = new Map(j.prices.map(([t, v]) => [day(t), +v.toPrecision(6)] as [string, number]));
          return { name: id, label: id[0].toUpperCase() + id.slice(1), unit: "USD", points: [...byDay], now: j.prices.at(-1)?.[1] };
        }));
        return frames(list, `${list.map((s) => s.label).join(" vs ")} · last ${days === 1 ? "24 hours" : `${days} days`}`, "CoinGecko daily price");
      },
    }),
    exchange_rates: tool({
      title: "Exchange rates",
      description: "Exchange rates between currencies (EUR, USD, GBP, JPY…), from the European Central Bank. E.g. \"euro to dollar over 3 months\".",
      input: {
        base: z.string().length(3).default("EUR").describe("ISO code of the base currency"),
        quotes: z.array(z.string().length(3)).min(1).max(5).describe('ISO codes to convert into, e.g. ["USD", "GBP"]'),
        days: z.number().int().min(1).max(365).default(30).describe("How many days of history"),
      },
      async run({ base, quotes, days }) {
        const qs = quotes.map((q: string) => q.toUpperCase());
        const j = await getJson<{ base: string; rates: Record<string, Record<string, number>> }>(
          `https://api.frankfurter.dev/v1/${day(Date.now() - days * 864e5)}..?base=${base.toUpperCase()}&symbols=${qs.join(",")}`);
        const dates = Object.keys(j.rates);
        const list = qs.map((q: string): Series => ({ name: `${j.base}→${q}`, label: `${j.base} → ${q}`, unit: q, points: dates.map((d) => [d, j.rates[d][q]]) }));
        return frames(list, `${j.base} to ${qs.join(", ")} · last ${days} days`, "European Central Bank reference rates via Frankfurter");
      },
    }),
  },
}).start();
