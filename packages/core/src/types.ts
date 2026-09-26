import type { Frame } from "./frame.ts";

export type JsonSchema = { type?: string; properties?: Record<string, JsonSchema & { description?: string }>; required?: string[]; [k: string]: unknown };
export type Args = Record<string, unknown>;

/** One callable tool on a connected MCP server. `id` is "<server>.<tool>". */
export interface ToolInfo {
  id: string;
  server: string;
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  /** What the server says about itself (its MCP `instructions`), shared by all its tools. */
  serverInfo?: string;
  /** Reads data only (the server's readOnlyHint, or a get/list/search… name when it gives no hints). */
  readOnly: boolean;
  /** Runs without asking. Read-only tools do by default; see `autoRun` in the server config. */
  autoRun: boolean;
}

/**
 * What the engine needs to know about a widget. The React component lives in the app;
 * this part is plain data + one pure function, so the server can reason about widgets
 * without importing any UI code.
 */
export interface WidgetSpec {
  id: string;
  name: string;
  /** A yes/no question the router asks about the user's message, e.g. "Does the message ask for a map?" */
  ask: string;
  /** How well this widget can draw the frame: 0 = can't, 1 = perfect. */
  score(frame: Frame): number;
}

export interface TraceStep {
  who: string;
  text: string;
  ms?: number;
}

/** A result on the canvas. */
export interface Tile {
  id: string;
  toolId: string;
  args: Args;
  frames: Frame[];
  widget: string;
  title: string;
  createdAt: number;
  trace: TraceStep[];
}

/** The tile the user is talking about, so follow-ups like "as a table" have context. */
export interface Focus {
  tileId: string;
  toolId: string;
  args: Args;
  widget: string;
  frames: Frame[];
}

export interface RouteDecision {
  by: string;
  ms: number;
  /** Candidate tools, most likely first. */
  tools: { id: string; p: number }[];
  /** Probability the message asks for none of the tools. */
  none: number;
  /** Probability the user explicitly asked for each widget, by widget id. */
  widgets: Record<string, number>;
  /** Probability the message names something new (a place, company, topic, time period). */
  newSubject: number;
  /** Probability the message adjusts the previous result ("and for the last 5 days?"). Low for off-topic chat. */
  followUp: number;
  /** Candidate servers, most likely first (two-step routing). */
  servers?: { id: string; p: number }[];
  /** A few likely tools, for a second opinion when the router is unsure. */
  shortlist?: string[];
}

/** Decides which tool and widget a message is about. Kev and an LLM both implement it. */
export interface Router {
  name: string;
  route(message: string, tools: ToolInfo[], widgets: WidgetSpec[]): Promise<RouteDecision>;
}

/** Any chat model that can answer with JSON. */
export interface LLM {
  name: string;
  json(system: string, user: string): Promise<unknown>;
}

/** Lists and calls tools. The MCP hub implements it; tests can fake it. */
export interface ToolRunner {
  list(): Promise<ToolInfo[]>;
  call(toolId: string, args: Args): Promise<Frame[]>;
}

export type EngineEvent =
  | { type: "step"; step: TraceStep }
  | { type: "clarify"; question: string; options: { toolId: string; label: string; p: number }[] }
  /** The tool can change things, so the user has to approve this exact call first. */
  | { type: "confirm"; toolId: string; title: string; args: Args; readOnly: boolean }
  | { type: "tile"; tile: Tile; replaces?: string }
  | { type: "say"; text: string }
  | { type: "error"; message: string };
