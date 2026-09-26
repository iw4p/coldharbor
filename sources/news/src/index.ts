#!/usr/bin/env node
import { defineSource, tool, z, type Frame } from "@glance/source-kit";
import { CENTROIDS } from "./centroids.ts";

interface Article { time: string; title: string; url: string; source: string; country: string; language: string }

// GDELT asks for at most one request every 5 seconds, so calls are queued and cached.
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;
const cache = new Map<string, { at: number; articles: Article[]; provider: string }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gdelt(query: string, days: number): Promise<Article[]> {
  const run = queue.then(async () => {
    await sleep(Math.max(0, 5200 - (Date.now() - lastCall)));
    lastCall = Date.now();
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&maxrecords=250&sort=DateDesc&timespan=${days}d&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`GDELT returned ${res.status}`);
    const text = await res.text();
    let json: { articles?: Record<string, string>[] };
    try { json = text.trim() ? JSON.parse(text) : {}; } catch { throw new Error(text.trim().slice(0, 200)); }
    return (json.articles ?? []).map((a) => ({
      time: `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}T${a.seendate.slice(9, 11)}:${a.seendate.slice(11, 13)}:00Z`,
      title: a.title, url: a.url, source: a.domain, country: a.sourcecountry, language: a.language,
    }));
  });
  queue = run.catch(() => {});
  return run;
}

/** Headlines only (no source country). Google allows the RSS feed for personal, non-commercial use. */
async function googleNews(query: string, days: number): Promise<Article[]> {
  const res = await fetch(`https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=${encodeURIComponent(`${query} when:${days}d`)}`,
    { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Google News returned ${res.status}`);
  const xml = await res.text();
  const tag = (s: string, t: string) => s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() ?? "";
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const source = tag(item, "source");
    const title = tag(item, "title");
    return {
      time: new Date(tag(item, "pubDate")).toISOString(), url: tag(item, "link"), source, country: "", language: "English",
      title: source && title.endsWith(` - ${source}`) ? title.slice(0, -source.length - 3) : title,
    };
  });
}

defineSource({
  name: "news",
  tools: {
    search_news: tool({
      title: "News",
      description: "Latest news articles and headlines about any topic, worldwide and in many languages. E.g. \"news about electric cars\", \"what's happening in Brazil?\".",
      input: {
        query: z.string().min(3).describe('1-4 English keywords, every word at least 3 letters (write "artificial intelligence", not "AI")'),
        days: z.number().int().min(1).max(90).default(7).describe("How many days back"),
      },
      async run({ query, days }) {
        const key = `${query.toLowerCase()}|${days}`;
        let hit = cache.get(key);
        if (!hit || Date.now() - hit.at > 10 * 60_000) {
          try {
            hit = { at: Date.now(), articles: await gdelt(query, days), provider: "GDELT" };
          } catch {
            hit = { at: Date.now(), articles: await googleNews(query, days), provider: "Google News" };
          }
          cache.set(key, hit);
        }
        const arts = hit.articles.sort((a, b) => b.time.localeCompare(a.time));
        if (!arts.length) throw new Error(`No news about "${query}" in the last ${days} days`);
        const title = `News: ${query}`;
        const sub = `${hit.provider} · ${arts.length} most recent articles · last ${days} days`;

        const headlines: Frame = {
          title, subtitle: sub,
          fields: [{ name: "time", type: "time" }, { name: "title", type: "string", label: "headline" }, { name: "url", type: "url" },
                   { name: "source", type: "string" }, { name: "country", type: "string" }],
          rows: arts.slice(0, 150).map((a) => ({ time: a.time, title: a.title, url: a.url, source: a.source, country: a.country || null })),
          labelField: "title",
          prefer: ["feed", "table"],
        };

        // Busy topics fill 250 articles within hours, so count per hour when they span < 3 days.
        const span = new Set(arts.map((a) => a.time.slice(0, 10))).size;
        const bucket = (t: string) => (span < 3 ? `${t.slice(0, 13)}:00:00Z` : t.slice(0, 10));
        const counts = new Map<string, number>();
        arts.forEach((a) => counts.set(bucket(a.time), (counts.get(bucket(a.time)) ?? 0) + 1));
        const timeline: Frame = {
          title: `${title} · articles per ${span < 3 ? "hour" : "day"}`, subtitle: sub,
          fields: [{ name: "time", type: "time" }, { name: "articles", type: "number" }],
          rows: [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([time, n]) => ({ time, articles: n })),
          prefer: ["line", "bar"],
        };

        const byCountry = new Map<string, number>();
        arts.forEach((a) => a.country && byCountry.set(a.country, (byCountry.get(a.country) ?? 0) + 1));
        const frames: Frame[] = [headlines, timeline];
        if (byCountry.size) frames.push({
          title: `${title} · by source country`, subtitle: sub,
          fields: [{ name: "country", type: "string" }, { name: "lat", type: "lat" }, { name: "lon", type: "lon" }, { name: "articles", type: "number" }],
          rows: [...byCountry].filter(([c]) => CENTROIDS[c]).sort((a, b) => b[1] - a[1])
            .map(([country, n]) => ({ country, lat: CENTROIDS[country][0], lon: CENTROIDS[country][1], articles: n })),
          labelField: "country",
          prefer: ["map", "bar"],
        });
        return frames;
      },
    }),
  },
}).start();
