/**
 * Shape inference: turn whatever JSON an MCP server returns into good Frames.
 *
 * Nothing here knows about any particular server. It relies on how JSON APIs are usually shaped:
 * a list of records (maybe wrapped in { items: [...] }), nested objects, fields named like
 * title/name, state/status, html_url, created_at. Each rule has a generic fallback.
 */
import type { Field, FieldType, Frame, Value } from "./frame.ts";

/** Field names that usually name a record, best first. */
const LABEL_KEYS = ["title", "name", "full_name", "subject", "summary", "headline", "message", "display_name", "login", "username", "label", "key", "slug", "path", "filename", "email"];
/** Field names that usually hold the page to open for a record. */
const URL_KEYS = ["html_url", "web_url", "permalink", "url", "link", "href", "profile_url"];
/** Field names that usually hold a small set of states worth grouping by. */
const GROUP_KEYS = ["state", "status", "stage", "phase", "conclusion", "priority", "severity", "category", "type", "kind", "level"];
const LAT = /^(lat|latitude)$/i, LON = /^(lon|lng|long|longitude)$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const MAX_DEPTH = 3, MAX_FIELDS = 14;

const leaf = (key: string) => key.split(".").pop()!.toLowerCase();
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isRecordList = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.length > 0 && v.every(isPlainObject);
const isScalar = (v: unknown) => v == null || typeof v !== "object";

/** Columns → rows: { time: [...], temp: [...] }, an object whose values are all equally long lists of plain values. */
function normalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalize);
  if (!isPlainObject(v)) return v;
  const cols = Object.values(v), n = Array.isArray(cols[0]) ? cols[0].length : 0;
  if (cols.length >= 2 && n >= 2 && cols.every((c) => Array.isArray(c) && c.length === n && c.every(isScalar)))
    return Array.from({ length: n }, (_, i) => Object.fromEntries(Object.entries(v).map(([k, c]) => [k, (c as unknown[])[i]])));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalize(x)]));
}

/** Unix timestamps (seconds or milliseconds) in a field named like a time: "t", "time", "created_at"… */
const TIME_KEY = /^(t|ts|time|timestamp|date|datetime|year)$|_(at|time|date)$/i;
const isEpoch = (v: unknown) => typeof v === "number" && ((v >= 1e9 && v < 1e10) || (v >= 1e12 && v < 1e13));

/** A name for an object inside a list, e.g. a label's name or a user's login. */
function nameOf(o: Record<string, unknown>): string | undefined {
  for (const k of LABEL_KEYS) if (typeof o[k] === "string" && o[k]) return o[k] as string;
}

/** { user: { login: "x" }, labels: [{ name: "bug" }] }  →  { "user.login": "x", labels: "bug" } */
function flatten(obj: Record<string, unknown>, prefix = "", depth = 0, out: Record<string, Value> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) out[key] = null;
    else if (Array.isArray(v)) {
      const parts = v.map((x) => (isPlainObject(x) ? nameOf(x) : x == null ? undefined : String(x))).filter(Boolean);
      out[key] = parts.length ? parts.join(", ") : v.length ? `${v.length} items` : null;
    } else if (isPlainObject(v)) {
      if (depth < MAX_DEPTH) flatten(v, key, depth + 1, out);
    } else out[key] = typeof v === "boolean" ? (v ? "yes" : "no") : (v as Value);
  }
  return out;
}

function typeOf(key: string, values: Value[]): FieldType {
  const vs = values.filter((v) => v != null && v !== "");
  if (!vs.length) return "string";
  if (TIME_KEY.test(leaf(key)) && vs.every((v) => /^(1[5-9]|2[01])\d\d$/.test(String(v)))) return "time"; // a "year" column
  if (vs.every((v) => typeof v === "number")) return LAT.test(leaf(key)) ? "lat" : LON.test(leaf(key)) ? "lon" : "number";
  const ss = vs.map(String);
  if (ss.every((s) => ISO_DATE.test(s))) return "time";
  // Other date formats JavaScript can read, as long as they carry a year and a time or a date separator.
  if (ss.every((s) => /\b(19|20)\d{2}\b/.test(s) && /[:\-/]/.test(s) && !Number.isNaN(Date.parse(s)) && !/^https?:/.test(s))) return "time";
  if (ss.every((s) => /^https?:\/\/\S+$/.test(s))) return "url";
  const avg = ss.reduce((n, s) => n + s.length, 0) / ss.length;
  if (avg > 160 || ss.filter((s) => s.includes("\n")).length > ss.length * 0.3) return "text";
  return "string";
}

/** Internal ids, API endpoints and images: rarely worth showing. */
function isNoise(key: string, type: FieldType, values: Value[]) {
  const k = leaf(key);
  if (k === "id" || k.endsWith("_id") || k === "sha" && key.includes(".")) return true;
  if (/avatar|gravatar|icon|image|thumbnail|email/.test(k)) return true;
  // All zeros / all "no": nothing to see.
  if (values.every((v) => v == null || v === 0 || v === "no" || v === "")) return true;
  if (type === "url" && values.some((v) => typeof v === "string" && /\/\/api\.|\/api\/|\/repos\//.test(v))) return true;
  return false;
}

/** The list of records inside `data`, even when wrapped ({ items: [...] }, { data: { results: [...] } }). */
function findRecords(data: unknown, depth = 0): { records: Record<string, unknown>[]; total?: number } | undefined {
  if (isRecordList(data)) return { records: data };
  if (!isPlainObject(data) || depth > 2) return;
  let best: { records: Record<string, unknown>[] } | undefined;
  for (const v of Object.values(data)) {
    const found = findRecords(v, depth + 1);
    if (found && (!best || found.records.length > best.records.length)) best = found;
  }
  const total = Object.entries(data).find(([k, v]) => /total|count/.test(k) && typeof v === "number")?.[1] as number | undefined;
  return best && { ...best, total };
}

function recordsToFrame(records: Record<string, unknown>[], title: string, total?: number): Frame {
  const flat = records.map((r) => flatten(r));
  const keys = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  for (const k of keys.filter((k) => TIME_KEY.test(leaf(k)) && flat.every((r) => r[k] == null || isEpoch(r[k]))))
    for (const r of flat) if (typeof r[k] === "number") r[k] = new Date(r[k] < 1e11 ? r[k] * 1000 : r[k]).toISOString();
  let fields: Field[] = keys
    .map((k) => ({ name: k, type: typeOf(k, flat.map((r) => r[k] ?? null)) }))
    .filter((f) => flat.some((r) => r[f.name] != null && r[f.name] !== ""));

  // Roles, chosen before dropping anything.
  const depth = (f: Field) => f.name.split(".").length;
  // Best by name priority, preferring fields nearer the top of the record (commit.message over commit.author.name).
  const byLeaf = (names: string[], ok: (f: Field) => boolean) =>
    fields.filter((f) => names.includes(leaf(f.name)) && ok(f))
      .sort((a, b) => depth(a) - depth(b) || names.indexOf(leaf(a.name)) - names.indexOf(leaf(b.name)))[0];
  // Fallback title: the first text field whose values look like names, not flags ("yes", "false").
  const flagLike = (f: Field) => flat.every((r) => r[f.name] == null || /^(yes|no|true|false)$/i.test(String(r[f.name])));
  const varies = (f: Field) => flat.length < 2 || new Set(flat.map((r) => r[f.name])).size > 1;
  let label = byLeaf(LABEL_KEYS.filter((k) => k !== "email"), (f) => f.type === "string" || f.type === "text") ?? fields.find((f) => f.type === "string" && !flagLike(f) && varies(f));
  const url = byLeaf(URL_KEYS, (f) => f.type === "url" && !isNoise(f.name, f.type, flat.map((r) => r[f.name] ?? null)))
    ?? fields.find((f) => f.type === "url" && !isNoise(f.name, f.type, flat.map((r) => r[f.name] ?? null)));
  const group = flat.length >= 2 ? byLeaf(GROUP_KEYS, (f) => {
    const distinct = new Set(flat.map((r) => r[f.name]).filter((v) => v != null));
    return f.type === "string" && distinct.size >= 2 && distinct.size <= 8 && distinct.size < flat.length;
  }) : undefined;

  // A long label (a commit message) becomes a one-line summary, and the full text stays available.
  if (label?.type === "text") {
    const src = label.name;
    for (const r of flat) r.summary = typeof r[src] === "string" ? (r[src] as string).split("\n")[0].slice(0, 140) : null;
    label = { name: "summary", type: "string" };
    fields.unshift(label);
  }

  // Nothing names the rows? Then an id is the best name there is: keep it rather than drop it as noise.
  if (!label) {
    const id = fields.find((f) => (leaf(f.name) === "id" || leaf(f.name).endsWith("_id")) && f.type !== "url");
    if (id) label = id;
  }
  const keep = new Set([label?.name, url?.name, group?.name, ...fields.filter((f) => f.type === "lat" || f.type === "lon").map((f) => f.name)].filter(Boolean));
  fields = fields.filter((f) => {
    if (keep.has(f.name)) return true;
    const values = flat.map((r) => r[f.name] ?? null);
    if (isNoise(f.name, f.type, values)) return false;
    if (f.type === "url") return false; // one link per record is enough
    // Columns that are the same in every row add nothing.
    return flat.length < 3 || new Set(values.map(String)).size > 1;
  });

  // Order: label, group, identifiers, dates, short strings, numbers, link, long text.
  const rank = (f: Field) =>
    f === label ? 0 : f === group ? 1 : leaf(f.name) === "number" ? 2 : f.type === "time" ? 3 : f.type === "string" ? 4 : f.type === "number" ? 5 : f.type === "url" ? 6 : 7;
  fields = fields.sort((a, b) => rank(a) - rank(b));
  // Cap the columns, but never drop the title, link or status: widgets depend on them.
  const roles = fields.filter((f) => keep.has(f.name));
  const rest = fields.filter((f) => !keep.has(f.name) && f.type !== "text").slice(0, Math.max(0, MAX_FIELDS - roles.length));
  const text = fields.filter((f) => f.type === "text" && !keep.has(f.name)).slice(0, 2);
  fields = [...roles, ...rest, ...text].sort((a, b) => rank(a) - rank(b));
  // Label nested fields by their last part ("created at"), adding the parent only when two would clash.
  const clash = new Set(fields.map((f) => leaf(f.name)).filter((l, i, all) => all.indexOf(l) !== i));
  for (const f of fields) if (f.name.includes(".")) f.label = (clash.has(leaf(f.name)) ? f.name.split(".").slice(-2).join(" ") : leaf(f.name)).replace(/_/g, " ");

  const prefer: string[] = [];
  // Places are best seen where they are.
  if (flat.length > 1 && fields.some((f) => f.type === "lat") && fields.some((f) => f.type === "lon")) prefer.push("map");
  if (flat.length === 1) prefer.push("detail");
  else if (label && url) prefer.push("feed", ...(group ? ["kanban"] : []), "table");
  else if (label && fields.some((f) => f.type === "number")) prefer.push("table", "bar");
  // Unnamed rows over time (a forecast, a price history) are a series.
  else if (fields.some((f) => f.type === "time") && fields.some((f) => f.type === "number")) prefer.push("line", "table");
  if (!prefer.includes("table")) prefer.push("table");
  // A series reads oldest first.
  const time = prefer[0] === "line" && fields.find((f) => f.type === "time")?.name;
  if (time) flat.sort((a, b) => String(a[time]).localeCompare(String(b[time])));

  return {
    title,
    subtitle: total && total > flat.length ? `${flat.length} of ${total.toLocaleString()}` : `${flat.length} item${flat.length === 1 ? "" : "s"}`,
    fields,
    rows: flat.map((r) => Object.fromEntries(fields.map((f) => [f.name, r[f.name] ?? null]))),
    labelField: label?.name,
    groupField: group?.name,
    prefer,
  };
}

// ── Text that is really data ─────────────────────────────────────────────────────────────────
// Many servers print instead of returning JSON. These are the common shapes, tried in order.

/** Python-style literals ({'a': True, 'b': None}) → JSON. Walks the text so quotes inside strings survive. */
function pythonToJson(src: string): string | undefined {
  let out = "";
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (c === "'" || c === '"') {
      let j = i + 1, str = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) {
          const n = src[j + 1];
          str += n === "n" ? "\n" : n === "t" ? "\t" : n;
          j += 2;
        } else str += src[j++];
      }
      if (j >= src.length) return undefined;
      out += JSON.stringify(str);
      i = j + 1;
    } else if (/[A-Za-z_]/.test(c)) {
      const word = src.slice(i).match(/^[A-Za-z_]\w*/)![0];
      out += word === "True" ? "true" : word === "False" ? "false" : word === "None" ? "null" : word;
      i += word.length;
    } else out += src[i++];
  }
  return out;
}

const SIZE = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|KiB|MiB|GiB|TiB)$/i;
const UNITS: Record<string, number> = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };
/** "13339" → 13339, "1.02 KB" → 1020, everything else unchanged. */
function scalarOf(v: string): Value {
  const t = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replaceAll(",", ""));
  if (/^(true|false)$/i.test(t)) return /^true$/i.test(t) ? "yes" : "no";
  const m = t.match(SIZE);
  if (m) return Math.round(Number(m[1]) * UNITS[m[2].toLowerCase()]);
  return t;
}

/** Turns printed data into objects when it has a recognisable shape; otherwise returns the text. */
export function parseText(text: string): unknown {
  // Some servers escape their newlines once or twice ("a\\nb"); a one-line text with those is really several lines.
  const t = (text.includes("\n") ? text : text.replace(/\\+n/g, "\n")).trim().replace(/^```\w*\n([\s\S]*?)\n```$/, "$1").trim();
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { const p = pythonToJson(s); if (p) try { return JSON.parse(p); } catch {} } };

  // JSON (or Python literals), whole or embedded after a sentence ("Found 3 rows: [...]").
  const whole = tryParse(t);
  if (whole !== undefined && typeof whole === "object") return whole;
  const start = t.search(/[[{]/), end = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}"));
  if (start >= 0 && end > start) {
    const inner = tryParse(t.slice(start, end + 1));
    if (inner && typeof inner === "object") return inner;
  }

  const lines = t.split("\n").map((l) => l.replace(/\s+$/, "")).filter(Boolean);
  if (lines.length < 2) return text;
  const most = (re: RegExp) => lines.filter((l) => re.test(l)).length >= Math.max(2, lines.length * 0.8);

  // Markdown table, with or without outer pipes, maybe under a title: found by its "--- | ---" line.
  const sep = lines.findIndex((l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(l));
  if (sep > 0) {
    const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const head = cells(lines[sep - 1]);
    return lines.slice(sep + 1).filter((l) => l.includes("|")).map((r) => Object.fromEntries(cells(r).map((c, i) => [head[i] || `col${i + 1}`, scalarOf(c)])));
  }
  // Tagged lines: "[DIR] apps", "[FILE] LICENSE    1.05 KB".
  const TAG = /^\s*\[([^\]]{1,20})\]\s+(.+?)(?:\s{2,}(\S.*))?$/;
  if (most(TAG)) {
    return lines.map((l) => l.match(TAG)).filter(Boolean).map((m) => ({ type: m![1], name: m![2].trim(), ...(m![3] ? { size: scalarOf(m![3]) } : {}) }));
  }
  // "key: value" lines → one record.
  const KV = /^\s*([\w][\w .\-/]{0,40}?)\s*[:=]\s+(.*)$/;
  if (most(KV)) {
    return Object.fromEntries(lines.map((l) => l.match(KV)).filter(Boolean).map((m) => [m![1].trim(), scalarOf(m![2])]));
  }
  // A plain list: short lines without sentences (paths, names, ids).
  if (lines.length >= 3 && lines.every((l) => l.length <= 200) && lines.filter((l) => l.trim().split(/\s+/).length <= 3).length >= lines.length * 0.8) {
    return lines.map((l) => ({ value: l.trim() }));
  }
  return text;
}

export function textFrame(text: string, title: string): Frame {
  return { title, fields: [{ name: "text", type: "text" }], rows: [{ text }], prefer: ["text"] };
}

/**
 * Best-effort conversion of arbitrary JSON into Frames: the main list (or record),
 * plus any lists nested inside a single record (an issue's comments, a PR's files).
 */
export function inferFrames(data: unknown, title: string): Frame[] {
  if (typeof data === "string") {
    const parsed = parseText(data);
    return typeof parsed === "string" ? [textFrame(parsed, title)] : inferFrames(parsed, title);
  }
  data = normalize(data);
  // { content: "..." }: a wrapper around printed text.
  if (isPlainObject(data)) {
    const vals = Object.values(data);
    if (vals.length === 1 && typeof vals[0] === "string") return inferFrames(vals[0], title);
  }
  const found = findRecords(data);
  if (found && !(isPlainObject(data) && Object.keys(data).length > 4 && found.records.length < 2)) {
    return [recordsToFrame(found.records, title, found.total)];
  }
  if (isPlainObject(data)) {
    const frames = [recordsToFrame([data], title)];
    for (const [k, v] of Object.entries(data)) if (isRecordList(v)) frames.push(recordsToFrame(v, `${title} · ${k.replace(/_/g, " ")}`));
    return frames;
  }
  if (Array.isArray(data)) return [recordsToFrame(data.map((v) => ({ value: v })), title)];
  return [textFrame(String(data), title)];
}
