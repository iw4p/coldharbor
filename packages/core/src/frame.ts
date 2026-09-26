/**
 * A Frame is the only thing sources and widgets agree on.
 *
 * Sources (MCP servers) return frames; widgets declare which frames they can draw.
 * Neither side knows the other exists, so either can be swapped or added freely.
 */

/** "text" is long prose (a description, a README, a commit message), shown in details rather than in tables. */
export type FieldType = "time" | "number" | "string" | "text" | "url" | "lat" | "lon";

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
  /** A string field with a few distinct values (state, status…) that rows can be grouped by. */
  groupField?: string;
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

export { inferFrames, textFrame } from "./infer.ts";
