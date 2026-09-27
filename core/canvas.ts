/**
 * The canvas: the chat (one run per message, with every event the engine produced) and the tiles.
 *
 * The server owns it. The browser sends intents that point at things by id; it can say "yes" to a call the
 * server proposed, but it can never describe a call itself. The server answers with edits, and both sides
 * apply them with the same function, so they can't drift apart.
 */
import { z } from "zod";
import type { EngineEvent, Tile } from "./types.ts";

export interface Run { id: string; message: string; events: EngineEvent[] }
export interface Canvas { runs: Run[]; tiles: Tile[] }

const Id = z.string().min(1);
const Layout = [
  z.object({ tile: Id, widget: Id }),
  z.object({ remove: Id }),
  z.object({ clear: z.literal(true) }),
] as const;

export const Intent = z.union([
  z.object({ ask: z.string().min(1), focus: Id.optional() }),
  /** Answer "which source?" with one of the offered tools. */
  z.object({ run: Id, choose: Id, focus: Id.optional() }),
  /** Run the call this run proposed, with values for the fields it asked for. */
  z.object({ run: Id, approve: z.record(z.string(), z.unknown()) }),
  z.object({ run: Id, cancel: z.literal(true) }),
  z.object({ refresh: Id }),
  ...Layout,
]);
export type Intent = z.infer<typeof Intent>;
export type Edit = { run: string; message: string } | { run: string; event: EngineEvent } | z.infer<(typeof Layout)[number]>;

export function apply(c: Canvas, e: Edit): Canvas {
  if ("clear" in e) return { runs: [], tiles: [] };
  if ("remove" in e) return { ...c, tiles: c.tiles.filter((t) => t.id !== e.remove) };
  if ("widget" in e) return { ...c, tiles: c.tiles.map((t) => (t.id === e.tile ? { ...t, widget: e.widget } : t)) };
  if ("message" in e) return { ...c, runs: [...c.runs, { id: e.run, message: e.message, events: [] }].slice(-40) };
  // Events for a run that's gone (the canvas was cleared meanwhile) change nothing.
  if (!c.runs.some((r) => r.id === e.run)) return c;
  const runs = c.runs.map((r) => (r.id === e.run ? { ...r, events: [...r.events, e.event] } : r));
  if (e.event.type !== "tile") return { ...c, runs };
  const { tile, replaces } = e.event;
  const tiles = replaces && c.tiles.some((t) => t.id === replaces) ? c.tiles.map((t) => (t.id === replaces ? tile : t)) : [tile, ...c.tiles];
  return { runs, tiles };
}
