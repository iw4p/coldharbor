import { defineSource, tool, z, type Frame } from "../core/source.ts";

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

/** Rough country centres for GDELT's source-country names, so news can go on a map. */
const CENTROIDS: Record<string, [number, number]> = {
  "United States": [39.8, -98.6], "United Kingdom": [54, -2.5], "Canada": [56, -96], "Australia": [-25, 134], "New Zealand": [-41.5, 172.8], "Ireland": [53.2, -8],
  "Germany": [51.2, 10.4], "France": [46.6, 2.4], "Italy": [42.8, 12.6], "Spain": [40.2, -3.6], "Portugal": [39.6, -8], "Netherlands": [52.2, 5.5], "Belgium": [50.6, 4.6],
  "Switzerland": [46.8, 8.2], "Austria": [47.6, 14.1], "Poland": [52, 19.4], "Czech Republic": [49.8, 15.5], "Slovakia": [48.7, 19.7], "Hungary": [47.2, 19.4],
  "Romania": [45.9, 24.9], "Bulgaria": [42.7, 25.5], "Greece": [39.1, 22], "Sweden": [62, 15], "Norway": [61, 9], "Denmark": [56, 10], "Finland": [64, 26], "Iceland": [65, -18],
  "Ukraine": [49, 31.4], "Russia": [60, 90], "Belarus": [53.7, 28], "Lithuania": [55.2, 23.9], "Latvia": [56.9, 24.6], "Estonia": [58.6, 25], "Serbia": [44, 20.9],
  "Croatia": [45.1, 15.2], "Slovenia": [46.1, 14.8], "Bosnia-Herzegovina": [44, 17.8], "Albania": [41.1, 20], "Macedonia": [41.6, 21.7], "Moldova": [47.2, 28.5],
  "Cyprus": [35, 33.2], "Malta": [35.9, 14.4], "Luxembourg": [49.8, 6.1], "Turkey": [39, 35.2], "Georgia": [42.3, 43.4], "Armenia": [40.1, 45], "Azerbaijan": [40.1, 47.6],
  "Kazakhstan": [48, 67], "Israel": [31.4, 35], "Lebanon": [33.9, 35.9], "Jordan": [31.2, 36.5], "Syria": [35, 38.5], "Iraq": [33.2, 43.7], "Iran": [32.4, 53.7],
  "Saudi Arabia": [23.9, 45], "United Arab Emirates": [23.4, 53.8], "Qatar": [25.3, 51.2], "Kuwait": [29.3, 47.5], "Bahrain": [26, 50.5], "Oman": [21.5, 55.9], "Yemen": [15.6, 48],
  "Egypt": [26.8, 30.8], "Morocco": [31.8, -7.1], "Algeria": [28, 1.7], "Tunisia": [34, 9.5], "Libya": [26.3, 17.2], "Sudan": [12.9, 30.2], "Ethiopia": [9.1, 40.5],
  "Kenya": [0, 37.9], "Uganda": [1.4, 32.3], "Tanzania": [-6.4, 34.9], "Nigeria": [9.1, 8.7], "Ghana": [7.9, -1], "Senegal": [14.5, -14.5], "Cameroon": [7.4, 12.4],
  "South Africa": [-30.6, 22.9], "Zimbabwe": [-19, 29.2], "Zambia": [-13.1, 27.8], "India": [21, 78], "Pakistan": [30.4, 69.3], "Bangladesh": [23.7, 90.4],
  "Sri Lanka": [7.9, 80.8], "Nepal": [28.4, 84.1], "Afghanistan": [33.9, 67.7], "China": [35.9, 104.2], "Hong Kong": [22.3, 114.2], "Taiwan": [23.7, 121],
  "Japan": [36.2, 138.3], "South Korea": [36.5, 127.9], "Mongolia": [46.9, 103.8], "Vietnam": [14.1, 108.3], "Thailand": [15.9, 101], "Malaysia": [4.2, 102],
  "Singapore": [1.35, 103.8], "Indonesia": [-2.5, 118], "Philippines": [12.9, 121.8], "Myanmar": [21.9, 95.9], "Cambodia": [12.6, 104.9], "Mexico": [23.6, -102.5],
  "Guatemala": [15.8, -90.2], "Costa Rica": [9.7, -83.8], "Panama": [8.5, -80.8], "Cuba": [21.5, -77.8], "Jamaica": [18.1, -77.3], "Dominican Republic": [18.7, -70.2],
  "Puerto Rico": [18.2, -66.6], "Colombia": [4.6, -74.3], "Venezuela": [6.4, -66.6], "Ecuador": [-1.8, -78.2], "Peru": [-9.2, -75], "Bolivia": [-16.3, -63.6],
  "Brazil": [-14.2, -51.9], "Chile": [-35.7, -71.5], "Argentina": [-38.4, -63.6], "Uruguay": [-32.5, -55.8], "Paraguay": [-23.4, -58.4],
};
