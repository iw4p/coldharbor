/**
 * A Frame is the only thing sources and widgets agree on.
 *
 * Sources (MCP servers) return frames; widgets declare which frames they can draw.
 * Neither side knows the other exists, so either can be swapped or added freely.
 */

export type FieldType = "time" | "number" | "string" | "url" | "lat" | "lon";

export interface Field {
  name: string;
  type: FieldType;
  unit?: string;
  /** Human label; defaults to `name`. */
  label?: string;
}

export type Value = string | number | null;

export interface Frame {
  title: string;
  subtitle?: string;
  fields: Field[];
  rows: Record<string, Value>[];
  /** Widget ids the source thinks suit this frame best, most suitable first. */
  prefer?: string[];
  /** The string field that names each row (a city, a ticker, a headline). */
  labelField?: string;
}

export const fieldsOf = (f: Frame, ...types: FieldType[]) => f.fields.filter((x) => types.includes(x.type));
export const hasField = (f: Frame, type: FieldType) => f.fields.some((x) => x.type === type);
export const labelOf = (field: Field) => field.label ?? field.name;

/** The field that names each row: the declared one, else the first plain string field. */
export function labelField(f: Frame): Field | undefined {
  return f.fields.find((x) => x.name === f.labelField) ?? f.fields.find((x) => x.type === "string");
}

export function isFrame(x: unknown): x is Frame {
  const f = x as Frame;
  return !!f && typeof f.title === "string" && Array.isArray(f.fields) && Array.isArray(f.rows);
}

export function textFrame(text: string, title: string): Frame {
  return { title, fields: [{ name: "text", type: "string" }], rows: [{ text }], prefer: ["text"] };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

function typeOf(key: string, v: unknown): FieldType {
  const k = key.toLowerCase();
  if (typeof v === "number") {
    if (k === "lat" || k === "latitude") return "lat";
    if (k === "lon" || k === "lng" || k === "longitude") return "lon";
    return "number";
  }
  if (typeof v === "string") {
    if (/^https?:\/\//.test(v)) return "url";
    if (ISO_DATE.test(v)) return "time";
  }
  return "string";
}

const scalar = (v: unknown): Value =>
  v == null ? null : typeof v === "number" || typeof v === "string" ? v : typeof v === "boolean" ? String(v) : JSON.stringify(v);

/**
 * Best-effort conversion of arbitrary JSON into a Frame, so MCP servers that know
 * nothing about ColdHarbor still show up as tables, charts or maps.
 */
export function inferFrame(data: unknown, title: string): Frame {
  if (Array.isArray(data) && data.length && data.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
    const rows = data as Record<string, unknown>[];
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 24);
    const fields: Field[] = keys.map((k) => {
      const sample = rows.find((r) => r[k] != null)?.[k];
      return { name: k, type: typeOf(k, sample) };
    });
    return { title, fields, rows: rows.map((r) => Object.fromEntries(keys.map((k) => [k, scalar(r[k])]))) };
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>);
    const list = entries.find(([, v]) => Array.isArray(v) && v.length && typeof v[0] === "object");
    if (list) return inferFrame(list[1], title);
    return inferFrame([data], title);
  }
  return textFrame(typeof data === "string" ? data : JSON.stringify(data, null, 2), title);
}
