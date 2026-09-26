import type { Field, Value } from "@coldharbor/core";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

export function fmtNumber(v: Value | undefined, digits?: number): string {
  if (v == null || v === "") return "–";
  if (typeof v !== "number") return String(v);
  const a = Math.abs(v);
  if (a >= 100_000) return compact.format(v);
  const d = digits ?? (a >= 1000 ? 0 : a >= 10 ? 2 : a >= 1 ? 3 : 4);
  return v.toLocaleString(undefined, { maximumFractionDigits: d });
}

export const fmtCompact = (v: number) => (Math.abs(v) >= 10_000 ? compact.format(v) : fmtNumber(v));

/** "Sep 24" for dates, "Sep 24 14:00" for hours. */
export function fmtTime(v: Value | undefined): string {
  if (typeof v !== "string") return String(v ?? "");
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(+d)) return v;
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return v.length > 10 && !/T00:00(:00)?/.test(v) ? `${date} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : date;
}

export function timeAgo(v: Value | undefined): string {
  if (typeof v !== "string") return "";
  const s = (Date.now() - +new Date(v)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const withUnit = (f: Field) => (f.unit ? `${f.label ?? f.name} (${f.unit})` : f.label ?? f.name);

/** Chart colors from the shadcn theme. */
export const color = (i: number) => `var(--chart-${(i % 5) + 1})`;

/**
 * Series on very different scales (AAPL at 250 vs NVDA at 120, or BTC vs SOL) are unreadable
 * on one axis, so they're shown as % change from the first value instead.
 */
export function shouldRebase(rows: Record<string, Value>[], keys: string[]): boolean {
  if (keys.length < 2) return false;
  const maxes = keys.map((k) => Math.max(...rows.map((r) => (typeof r[k] === "number" ? Math.abs(r[k] as number) : 0))));
  return Math.max(...maxes) / Math.max(1e-9, Math.min(...maxes)) > 3;
}

export function rebase(rows: Record<string, Value>[], keys: string[]) {
  const first = Object.fromEntries(keys.map((k) => [k, rows.find((r) => typeof r[k] === "number")?.[k] as number]));
  return rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, typeof r[k] === "number" ? +(((r[k] as number) / first[k] - 1) * 100).toFixed(2) : null])) }));
}
