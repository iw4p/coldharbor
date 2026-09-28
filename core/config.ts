import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

const Common = {
  disabled: z.boolean().optional(),
  /** Which tools run without asking: "read-only" (default), "all", or "never". */
  autoRun: z.enum(["read-only", "all", "never"]).optional(),
  /** Set by the loader: environment variables the entry uses that aren't set. */
  missing: z.array(z.string()).optional(),
};
/** Same shape as Claude Desktop / Cursor `mcpServers` entries, so configs can be copied across. */
export const ServerConfig = z.union([
  z.object({ command: z.string(), args: z.array(z.string()).optional(), env: z.record(z.string(), z.string()).optional(), cwd: z.string().optional(), ...Common }),
  z.object({ url: z.string(), headers: z.record(z.string(), z.string()).optional(), ...Common }),
]);

export const Config = z.object({
  /**
   * Who answers the quick questions: a System One endpoint, local Kev or hosted Jev (TypeSafe). "hybrid": with the LLM as a
   * second opinion when it's unsure which tool is meant. "kev": System One only (fastest). "llm": the LLM answers everything.
   */
  router: z.union([
    z.object({
      type: z.enum(["kev", "hybrid"]),
      baseUrl: z.string().default("http://127.0.0.1:8009"),
      model: z.string().default("kev-latest"),
      apiKey: z.string().optional(),
    }),
    z.object({ type: z.literal("llm") }),
  ]).prefault({ type: "hybrid" }),
  /** The chat model that fills in tool arguments. "openai" works with any compatible server (LM Studio, vLLM, llama.cpp, OpenRouter…). */
  llm: z.object({
    provider: z.enum(["ollama", "openai"]).default("ollama"),
    model: z.string().default("qwen3.5:latest"),
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
  }).prefault({}),
  mcpServers: z.record(z.string(), ServerConfig).default({}),
});
export type ServerConfig = z.infer<typeof ServerConfig>;
export type Config = z.infer<typeof Config>;

export const CONFIG_FILE = "coldharbor.config.json";

/** Walks up from `from` to find coldharbor.config.json (or uses COLDHARBOR_CONFIG). */
export function findConfig(from = process.cwd()): string | undefined {
  if (process.env.COLDHARBOR_CONFIG) return resolve(process.env.COLDHARBOR_CONFIG);
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, CONFIG_FILE))) return join(dir, CONFIG_FILE);
    if (dirname(dir) === dir) return undefined;
  }
}

/** Loads KEY=value lines from .env and .env.local next to the config (without overriding the real environment). */
function loadDotenv(dir: string) {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(join(dir, file))) continue;
    for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

/** "${NAME}" in any string is replaced with the environment variable NAME, so secrets stay out of the file. */
const interpolate = (json: string) => json.replace(/\$\{(\w+)\}/g, (_, k) => JSON.stringify(process.env[k] ?? "").slice(1, -1));

export function loadConfig(path = findConfig()): { config: Config; root: string; path?: string } {
  if (!path) return { config: Config.parse({}), root: process.cwd() };
  loadDotenv(dirname(path));
  const raw = readFileSync(path, "utf8");
  const parsed = Config.safeParse(JSON.parse(interpolate(raw)));
  if (!parsed.success) throw new Error(`${path}:\n${z.prettifyError(parsed.error)}`);
  // Servers whose ${VARS} aren't set are marked, so they show "needs setup" instead of failing to start.
  const servers: Record<string, unknown> = JSON.parse(raw).mcpServers ?? {};
  for (const [name, s] of Object.entries(parsed.data.mcpServers)) {
    const missing = [...JSON.stringify(servers[name]).matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !process.env[k]);
    if (missing.length) s.missing = missing;
  }
  return { config: parsed.data, root: dirname(path), path };
}
