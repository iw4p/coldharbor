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
  if (vs.every((v) => typeof v === "number")) return LAT.test(leaf(key)) ? "lat" : LON.test(leaf(key)) ? "lon" : "number";
  const ss = vs.map(String);
  if (ss.every((s) => ISO_DATE.test(s))) return "time";
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
  if (k.endsWith("_url") && !URL_KEYS.includes(k)) return true;
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
  let fields: Field[] = keys
    .map((k) => ({ name: k, type: typeOf(k, flat.map((r) => r[k] ?? null)) }))
    .filter((f) => flat.some((r) => r[f.name] != null && r[f.name] !== ""));

  // Roles, chosen before dropping anything.
  const depth = (f: Field) => f.name.split(".").length;
  // Best by name priority, preferring fields nearer the top of the record (commit.message over commit.author.name).
  const byLeaf = (names: string[], ok: (f: Field) => boolean) =>
    fields.filter((f) => names.includes(leaf(f.name)) && ok(f))
      .sort((a, b) => depth(a) - depth(b) || names.indexOf(leaf(a.name)) - names.indexOf(leaf(b.name)))[0];
  let label = byLeaf(LABEL_KEYS.filter((k) => k !== "email"), (f) => f.type === "string" || f.type === "text") ?? fields.find((f) => f.type === "string");
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

  const keep = new Set([label?.name, url?.name, group?.name].filter(Boolean));
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
  const text = fields.filter((f) => f.type === "text");
  fields = [...fields.filter((f) => f.type !== "text").slice(0, MAX_FIELDS), ...text.slice(0, 2)];
  // Label nested fields by their last part ("created at"), adding the parent only when two would clash.
  const clash = new Set(fields.map((f) => leaf(f.name)).filter((l, i, all) => all.indexOf(l) !== i));
  for (const f of fields) if (f.name.includes(".")) f.label = (clash.has(leaf(f.name)) ? f.name.split(".").slice(-2).join(" ") : leaf(f.name)).replace(/_/g, " ");

  const prefer: string[] = [];
  if (flat.length === 1) prefer.push("detail");
  else if (label && url) prefer.push("feed", ...(group ? ["kanban"] : []), "table");
  else if (label && fields.some((f) => f.type === "number")) prefer.push("table", "bar");
  if (!prefer.includes("table")) prefer.push("table");

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

export function textFrame(text: string, title: string): Frame {
  return { title, fields: [{ name: "text", type: "text" }], rows: [{ text }], prefer: ["text"] };
}

/**
 * Best-effort conversion of arbitrary JSON into Frames: the main list (or record),
 * plus any lists nested inside a single record (an issue's comments, a PR's files).
 */
export function inferFrames(data: unknown, title: string): Frame[] {
  if (typeof data === "string") return [textFrame(data, title)];
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
