import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { LLMConfig } from "./llm.ts";
import type { ServerConfig } from "./mcp.ts";

export interface GlanceConfig {
  /** Which router decides tool + widget. Kev is fast and calibrated; "llm" needs nothing extra. */
  router: { type: "kev"; baseUrl: string; apiKey?: string } | { type: "llm" };
  /** The chat model that fills in tool arguments (and routes, when router.type is "llm"). */
  llm: LLMConfig;
  /** Any MCP servers, in the same format as Claude Desktop's config. */
  mcpServers: Record<string, ServerConfig>;
}

export const CONFIG_FILE = "glance.config.json";

const DEFAULTS: GlanceConfig = {
  router: { type: "kev", baseUrl: "http://127.0.0.1:8009" },
  llm: { provider: "ollama", model: "qwen3.5:latest" },
  mcpServers: {},
};

/** Walks up from `from` to find glance.config.json (or uses GLANCE_CONFIG). */
export function findConfig(from = process.cwd()): string | undefined {
  if (process.env.GLANCE_CONFIG) return resolve(process.env.GLANCE_CONFIG);
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

export function loadConfig(path = findConfig()): { config: GlanceConfig; root: string; path?: string } {
  if (!path) return { config: DEFAULTS, root: process.cwd() };
  const raw = interpolate(JSON.parse(readFileSync(path, "utf8")));
  return {
    config: { ...DEFAULTS, ...raw, llm: { ...DEFAULTS.llm, ...raw.llm }, router: raw.router ?? DEFAULTS.router },
    root: dirname(path),
    path,
  };
}
