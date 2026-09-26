/** Server-side entry: config, MCP hub, router and LLM wired together once per process. */
import { loadConfig, type ColdHarborConfig } from "./config.ts";
import { ask, type AskInput } from "./engine.ts";
import { createLLM } from "./llm.ts";
import { McpHub } from "./mcp.ts";
import { hybridRouter, kevRouter, llmRouter } from "./routers.ts";
import type { LLM, Router, WidgetSpec } from "./types.ts";

export * from "./index.ts";
export { ask, THRESHOLDS, type AskInput, type EngineDeps } from "./engine.ts";
export { createLLM, type LLMConfig } from "./llm.ts";
export { McpHub, toFrames, type ServerConfig, type ServerStatus } from "./mcp.ts";
export { hybridRouter, kevRouter, llmRouter } from "./routers.ts";
export { findConfig, loadConfig, type ColdHarborConfig } from "./config.ts";

export interface ColdHarbor {
  config: ColdHarborConfig;
  configPath?: string;
  hub: McpHub;
  llm: LLM;
  router: Router;
  ask(input: AskInput, widgets: WidgetSpec[]): ReturnType<typeof ask>;
}

// Only the MCP hub is kept for the life of the process (and across hot reloads), so servers
// aren't respawned. Everything else is cheap and rebuilt, so code changes apply immediately.
const g = globalThis as unknown as { __coldharborHub?: McpHub };

export function coldharbor(): ColdHarbor {
  const { config, root, path } = loadConfig();
  const hub = (g.__coldharborHub ??= new McpHub(config.mcpServers, root));
  const llm = createLLM(config.llm);
  const r = config.router;
  const router = r.type === "llm" ? llmRouter(llm) : r.type === "kev" ? kevRouter(r) : hybridRouter(kevRouter(r), llmRouter(llm));
  return {
    config, configPath: path, hub, llm, router,
    ask: (input, widgets) => ask(input, { router, llm, tools: hub, widgets }),
  };
}
