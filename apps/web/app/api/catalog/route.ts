import { glance } from "@glance/core/server";
import { specs } from "@/widgets/specs.ts";

export const dynamic = "force-dynamic";

async function reachable(url: string) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

/** Everything connected: MCP servers and their tools, widgets, router and LLM health. */
export async function GET() {
  const g = glance();
  const tools = await g.hub.list();
  const { router, llm } = g.config;
  const [routerUp, llmUp] = await Promise.all([
    router.type !== "llm" ? reachable(`${router.baseUrl}/v1/models`) : Promise.resolve(true),
    llm.provider === "ollama" ? reachable(`${llm.baseUrl ?? "http://127.0.0.1:11434"}/api/tags`) : Promise.resolve(true),
  ]);
  return Response.json({
    configPath: g.configPath,
    servers: g.hub.serverStatus(),
    tools: tools.map(({ id, server, name, title, description }) => ({ id, server, name, title, description })),
    widgets: specs.map(({ id, name, ask }) => ({ id, name, ask })),
    router: { name: g.router.name, up: routerUp },
    llm: { name: `${llm.model} (${llm.provider})`, up: llmUp },
  });
}
