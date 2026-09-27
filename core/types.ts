import type { Frame } from "./frame.ts";

export type Args = Record<string, unknown>;
export type JsonSchema = { type?: string; properties?: Record<string, JsonSchema & { description?: string; enum?: unknown[]; default?: unknown }>; required?: string[]; [k: string]: unknown };

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

/** Lists and calls tools, and remembers facts about a server for as long as it stays connected. The MCP hub implements it. */
export interface ToolRunner {
  list(): Promise<ToolInfo[]>;
  call(toolId: string, args: Args): Promise<Frame[]>;
  memo<T>(server: string, key: string, make: () => Promise<T>): Promise<T>;
}

/** Any chat model that can answer with JSON. */
export interface LLM {
  name: string;
  json(system: string, user: string): Promise<unknown>;
}

export interface Call { toolId: string; args: Args }
export interface Step { who: string; text: string; ms?: number }

/** A required tool argument the user still has to give. */
export interface InputField { name: string; description?: string; type?: string; enum?: string[] }

/** A result on the canvas. */
export interface Tile extends Call {
  id: string;
  frames: Frame[];
  widget: string;
  title: string;
  createdAt: number;
  trace: Step[];
}

export type EngineEvent =
  | { type: "step"; step: Step }
  | { type: "clarify"; question: string; options: { toolId: string; label: string; p: number }[] }
  /** The tool can change things, so the user has to approve this exact call first. */
  | { type: "confirm"; call: Call; title: string; readOnly: boolean }
  /** Required arguments are still missing: ask for them instead of guessing. */
  | { type: "needs-input"; call: Call; title: string; fields: InputField[]; readOnly: boolean }
  | { type: "tile"; tile: Tile; replaces?: string }
  | { type: "say"; text: string }
  | { type: "error"; message: string };
