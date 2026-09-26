import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { LLMConfig } from "./llm.ts";
import type { ServerConfig } from "./mcp.ts";

export interface ColdHarborConfig {
  /**
   * Which router decides tool + widget.
   * "hybrid": Kev, escalating to the LLM only when Kev is unsure (best accuracy and speed).
   * "kev": Kev only (fastest). "llm": the LLM only (needs nothing extra, slowest).
   */
  router: { type: "kev" | "hybrid"; baseUrl: string; apiKey?: string } | { type: "llm" };
  /** The chat model that fills in tool arguments (and routes, when router.type is "llm"). */
  llm: LLMConfig;
  /** Any MCP servers, in the same format as Claude Desktop's config. */
  mcpServers: Record<string, ServerConfig>;
}

export const CONFIG_FILE = "coldharbor.config.json";

const DEFAULTS: ColdHarborConfig = {
  router: { type: "hybrid", baseUrl: "http://127.0.0.1:8009" },
  llm: { provider: "ollama", model: "qwen3.5:latest" },
  mcpServers: {},
};

/** Walks up from `from` to find coldharbor.config.json (or uses COLDHARBOR_CONFIG). */
export function findConfig(from = process.cwd()): string | undefined {
  if (process.env.COLDHARBOR_CONFIG) return resolve(process.env.COLDHARBOR_CONFIG);
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, CONFIG_FILE))) return join(dir, CONFIG_FILE);
    if (dirname(dir) === dir) return undefined;
  }
}

/** "${NAME}" in any string is replaced with the environment variable NAME, so secrets stay out of the file. */
function interpolate<T>(v: T): T {
  if (typeof v === "string") return v.replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] ?? "") as T;
  if (Array.isArray(v)) return v.map(interpolate) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, interpolate(x)])) as T;
  return v;
}

export function loadConfig(path = findConfig()): { config: ColdHarborConfig; root: string; path?: string } {
  if (!path) return { config: DEFAULTS, root: process.cwd() };
  const raw = interpolate(JSON.parse(readFileSync(path, "utf8")));
  return {
    config: { ...DEFAULTS, ...raw, llm: { ...DEFAULTS.llm, ...raw.llm }, router: raw.router ?? DEFAULTS.router },
    root: dirname(path),
    path,
  };
}
