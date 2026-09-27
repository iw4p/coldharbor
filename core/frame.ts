/**
 * A Frame is the only thing sources and widgets agree on.
 *
 * Sources (MCP servers) return frames; widgets say which frames they can draw.
 * Neither side knows the other exists, so either can be swapped or added freely.
 */
import { z } from "zod";

/** "text" is long prose (a description, a README, a commit message), shown in details rather than in tables. */
export const FieldType = z.enum(["time", "number", "string", "text", "url", "lat", "lon"]);
export const Field = z.object({ name: z.string(), type: FieldType, unit: z.string().optional(), label: z.string().optional() });
export const Value = z.union([z.string(), z.number(), z.null()]);
export const Frame = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  fields: z.array(Field),
  rows: z.array(z.record(z.string(), Value)),
  /** Widget ids the source thinks suit this frame best, most suitable first. */
  prefer: z.array(z.string()).optional(),
  /** The string field that names each row (a city, a ticker, a headline). */
  labelField: z.string().optional(),
  /** A string field with a few distinct values (state, status…) that rows can be grouped by. */
  groupField: z.string().optional(),
});
export type FieldType = z.infer<typeof FieldType>;
export type Field = z.infer<typeof Field>;
export type Value = z.infer<typeof Value>;
export type Frame = z.infer<typeof Frame>;

/** The widget side of the contract: plain data and one pure function, so the server can use it without any UI code. */
export interface WidgetSpec {
  id: string;
  name: string;
  /** A yes/no question System One answers about the user's message, e.g. "Does the message ask for a map?" */
  ask: string;
  /** How well this widget can draw the frame: 0 = can't, 1 = perfect. */
  score(frame: Frame): number;
}

export const fieldsOf = (f: Frame, ...types: FieldType[]) => f.fields.filter((x) => types.includes(x.type));
export const hasField = (f: Frame, type: FieldType) => f.fields.some((x) => x.type === type);

/** Numbers that name things rather than measure them (an issue number, an id, a rank). */
const IDENTIFIER = /(^|\.)(number|id|index|no|num|rank|position|order|pk|key)$|_id$/i;

/** Number fields worth charting or showing as a big number: measurements, not identifiers. */
export const measures = (f: Frame) => f.fields.filter((x) => x.type === "number" && !IDENTIFIER.test(x.name));

/** The field that names each row: the declared one, else the first plain string field. */
export const labelField = (f: Frame) => f.fields.find((x) => x.name === f.labelField) ?? f.fields.find((x) => x.type === "string");

/**
 * Widgets that can draw at least one of the frames, best first.
 * A source's first frame is its main answer, and its `prefer` hints nudge the choice.
 */
export function rankWidgets(widgets: WidgetSpec[], frames: Frame[]) {
  const score = (w: WidgetSpec) => Math.max(0, ...frames.map((f, i) => {
    const s = w.score(f);
    const prefer = f.prefer?.includes(w.id) ? 0.15 - 0.03 * f.prefer.indexOf(w.id) : 0;
    return s > 0 ? s + prefer + (i === 0 ? 0.25 : 0) : 0;
  }));
  return widgets.map((w) => ({ id: w.id, score: score(w) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
}

/** The frame a widget should draw: the one it scores highest. */
export const frameFor = (widget: WidgetSpec, frames: Frame[]) => [...frames].sort((a, b) => widget.score(b) - widget.score(a))[0];
