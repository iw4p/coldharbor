/** Server-side entry: config, MCP hub, router and LLM wired together once per process. */
import { loadConfig, type GlanceConfig } from "./config.ts";
import { ask, type AskInput } from "./engine.ts";
import { createLLM } from "./llm.ts";
import { McpHub } from "./mcp.ts";
import { kevRouter, llmRouter } from "./routers.ts";
import type { LLM, Router, WidgetSpec } from "./types.ts";

export * from "./index.ts";
export { ask, THRESHOLDS, type AskInput, type EngineDeps } from "./engine.ts";
export { createLLM, type LLMConfig } from "./llm.ts";
export { McpHub, toFrames, type ServerConfig, type ServerStatus } from "./mcp.ts";
export { kevRouter, llmRouter } from "./routers.ts";
export { findConfig, loadConfig, type GlanceConfig } from "./config.ts";

export interface Glance {
  config: GlanceConfig;
  configPath?: string;
  hub: McpHub;
  llm: LLM;
  router: Router;
  ask(input: AskInput, widgets: WidgetSpec[]): ReturnType<typeof ask>;
}

// Only the MCP hub is kept for the life of the process (and across hot reloads), so servers
// aren't respawned. Everything else is cheap and rebuilt, so code changes apply immediately.
const g = globalThis as unknown as { __glanceHub?: McpHub };

export function glance(): Glance {
  const { config, root, path } = loadConfig();
  const hub = (g.__glanceHub ??= new McpHub(config.mcpServers, root));
  const llm = createLLM(config.llm);
  const router = config.router.type === "kev" ? kevRouter(config.router) : llmRouter(llm);
  return {
    config, configPath: path, hub, llm, router,
    ask: (input, widgets) => ask(input, { router, llm, tools: hub, widgets }),
  };
}
