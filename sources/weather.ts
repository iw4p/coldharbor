import { defineSource, tool, getJson, z, type Frame } from "../core/source.ts";

type Geo = { results?: { name: string; country_code: string; latitude: number; longitude: number }[] };
type Forecast = {
  daily: Record<"time" | "temperature_2m_max" | "temperature_2m_min" | "precipitation_sum" | "wind_speed_10m_max", (number | string)[]>;
  current: { temperature_2m: number; precipitation: number; wind_speed_10m: number };
};

const METRICS = {
  temperature: { keys: [["temperature_2m_max", "max"], ["temperature_2m_min", "min"]], unit: "°C", label: "temperature" },
  rain: { keys: [["precipitation_sum", "rain"]], unit: "mm", label: "rain" },
  wind: { keys: [["wind_speed_10m_max", "wind"]], unit: "km/h", label: "max wind" },
} as const;

defineSource({
  name: "weather",
  tools: {
    forecast: tool({
      title: "Weather",
      description: "Weather forecast or recent history (temperature, rain, wind) for one or more cities. E.g. \"weather in Berlin this week\", \"will it rain in London?\", \"compare Paris and Rome\".",
      input: {
        cities: z.array(z.string()).min(1).max(6).describe('City names, e.g. ["Berlin"] or ["Paris", "Rome"]'),
        days: z.number().int().min(1).max(16).default(7).describe("How many days"),
        past: z.boolean().default(false).describe("true for the past days instead of the forecast"),
        metric: z.enum(["temperature", "rain", "wind"]).default("temperature").describe("What the user cares about"),
      },
      async run({ cities, days, past, metric }) {
        const span = past ? `past_days=${Math.min(days, 92)}&forecast_days=1` : `forecast_days=${Math.min(days, 16)}`;
        const got = await Promise.all(cities.map(async (city) => {
          const place = (await getJson<Geo>(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`)).results?.[0];
          if (!place) throw new Error(`Couldn't find a place called "${city}"`);
          const w = await getJson<Forecast>(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&timezone=auto&${span}` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&current=temperature_2m,precipitation,wind_speed_10m`);
          return { place, w };
        }));
        const m = METRICS[metric];
        const when = `${past ? "last" : "next"} ${days} days`;
        const dates = got[0].w.daily.time as string[];

        // Frame 1: the metric over time (one column per city when comparing).
        const series: Frame = got.length === 1
          ? {
              title: `${got[0].place.name} · ${m.label} · ${when}`,
              subtitle: `Open-Meteo ${past ? "history" : "forecast"}`,
              fields: [{ name: "date", type: "time" }, ...m.keys.map(([, n]) => ({ name: n, type: "number" as const, unit: m.unit }))],
              rows: dates.map((d, i) => ({ date: d, ...Object.fromEntries(m.keys.map(([k, n]) => [n, got[0].w.daily[k][i] as number])) })),
              prefer: metric === "rain" ? ["bar", "line"] : ["line", "bar"],
            }
          : {
              title: `${got.map((g) => g.place.name).join(", ")} · ${m.label} · ${when}`,
              subtitle: `Open-Meteo ${past ? "history" : "forecast"}${metric === "temperature" ? " · daily max" : ""}`,
              fields: [{ name: "date", type: "time" }, ...got.map((g) => ({ name: g.place.name, type: "number" as const, unit: m.unit }))],
              rows: dates.map((d, i) => ({ date: d, ...Object.fromEntries(got.map((g) => [g.place.name, g.w.daily[m.keys[0][0]][i] as number])) })),
              prefer: metric === "rain" ? ["bar", "line"] : ["line", "bar"],
            };

        // Frame 2: right now, one row per city, with coordinates for maps.
        const now: Frame = {
          title: `${got.map((g) => g.place.name).join(", ")} · right now`,
          subtitle: "Open-Meteo current conditions",
          fields: [
            { name: "city", type: "string" }, { name: "lat", type: "lat" }, { name: "lon", type: "lon" },
            { name: metric === "rain" ? "rain" : metric === "wind" ? "wind" : "temperature", type: "number", unit: m.unit },
            ...(metric !== "temperature" ? [{ name: "temperature", type: "number" as const, unit: "°C" }] : []),
            ...(metric !== "rain" ? [{ name: "rain", type: "number" as const, unit: "mm" }] : []),
            ...(metric !== "wind" ? [{ name: "wind", type: "number" as const, unit: "km/h" }] : []),
          ],
          rows: got.map(({ place, w }) => ({
            city: place.name, lat: place.latitude, lon: place.longitude,
            temperature: w.current.temperature_2m, rain: w.current.precipitation, wind: w.current.wind_speed_10m,
          })),
          labelField: "city",
          prefer: ["map", "stat"],
        };

        // Frame 3: every daily value, for tables.
        const detail: Frame = {
          title: `${got.map((g) => g.place.name).join(", ")} · daily details · ${when}`,
          fields: [
            { name: "date", type: "time" }, ...(got.length > 1 ? [{ name: "city", type: "string" as const }] : []),
            { name: "max", type: "number", unit: "°C" }, { name: "min", type: "number", unit: "°C" },
            { name: "rain", type: "number", unit: "mm" }, { name: "wind", type: "number", unit: "km/h" },
          ],
          rows: got.flatMap(({ place, w }) => dates.map((d, i) => ({
            date: d, ...(got.length > 1 ? { city: place.name } : {}),
            max: w.daily.temperature_2m_max[i] as number, min: w.daily.temperature_2m_min[i] as number,
            rain: w.daily.precipitation_sum[i] as number, wind: w.daily.wind_speed_10m_max[i] as number,
          }))),
          prefer: ["table"],
        };
        return [series, now, detail];
      },
    }),
  },
}).start();
