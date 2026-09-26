import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { inferFrame, isFrame, textFrame, type Frame } from "./frame.ts";
import type { Args, ToolInfo, ToolRunner } from "./types.ts";

/** Same shape as Claude Desktop / Cursor `mcpServers` entries, so configs can be copied across. */
export type ServerConfig =
  | { command: string; args?: string[]; env?: Record<string, string>; cwd?: string; disabled?: boolean }
  | { url: string; headers?: Record<string, string>; disabled?: boolean };

export interface ServerStatus {
  name: string;
  state: "connecting" | "ready" | "error" | "disabled";
  error?: string;
  tools: string[];
}

/** Connects to every configured MCP server and exposes all their tools as one catalog. */
export class McpHub implements ToolRunner {
  private clients = new Map<string, Promise<Client>>();
  private status = new Map<string, ServerStatus>();

  private servers: Record<string, ServerConfig>;
  private root: string;

  constructor(servers: Record<string, ServerConfig>, root: string) {
    this.servers = servers;
    this.root = root;
    for (const name of Object.keys(servers)) {
      this.status.set(name, { name, state: servers[name].disabled ? "disabled" : "connecting", tools: [] });
    }
  }

  private connect(name: string): Promise<Client> {
    let c = this.clients.get(name);
    if (!c) {
      c = (async () => {
        const cfg = this.servers[name];
        const client = new Client({ name: "coldharbor", version: "0.1.0" });
        const transport = "url" in cfg
          ? new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers } })
          : new StdioClientTransport({ command: cfg.command, args: cfg.args, cwd: cfg.cwd ?? this.root, env: { ...getDefaultEnvironment(), ...cfg.env }, stderr: "pipe" });
        transport.onclose = () => {
          this.clients.delete(name);
          this.status.set(name, { name, state: "error", error: "disconnected", tools: [] });
        };
        await client.connect(transport);
        return client;
      })();
      c.catch((e) => {
        this.clients.delete(name);
        this.status.set(name, { name, state: "error", error: String(e?.message ?? e), tools: [] });
      });
      this.clients.set(name, c);
    }
    return c;
  }

  async list(): Promise<ToolInfo[]> {
    const names = Object.keys(this.servers).filter((n) => !this.servers[n].disabled);
    const lists = await Promise.all(names.map(async (server) => {
      try {
        const { tools } = await (await this.connect(server)).listTools();
        this.status.set(server, { name: server, state: "ready", tools: tools.map((t) => t.name) });
        return tools.map((t): ToolInfo => ({
          id: `${server}.${t.name}`,
          server,
          name: t.name,
          title: t.title ?? t.annotations?.title ?? t.name.replace(/[_-]/g, " "),
          description: t.description ?? "",
          inputSchema: t.inputSchema as ToolInfo["inputSchema"],
        }));
      } catch (e) {
        this.status.set(server, { name: server, state: "error", error: String((e as Error)?.message ?? e), tools: [] });
        return [];
      }
    }));
    return lists.flat();
  }

  async call(toolId: string, args: Args): Promise<Frame[]> {
    const dot = toolId.indexOf(".");
    const [server, name] = [toolId.slice(0, dot), toolId.slice(dot + 1)];
    const res = await (await this.connect(server)).callTool({ name, arguments: args });
    const text = ((res.content as { type: string; text?: string }[] | undefined) ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    if (res.isError) throw new Error(text || `${toolId} failed`);
    return toFrames(res.structuredContent, text, name);
  }

  serverStatus(): ServerStatus[] {
    return [...this.status.values()];
  }

  async close() {
    await Promise.all([...this.clients.values()].map(async (c) => (await c).close().catch(() => {})));
  }
}

/** ColdHarbor sources return `{ frames }`; anything else is converted as well as we can. */
export function toFrames(structured: unknown, text: string, title: string): Frame[] {
  const frames = (structured as { frames?: unknown[] } | undefined)?.frames;
  if (Array.isArray(frames) && frames.every(isFrame)) return frames as Frame[];
  if (structured) return [inferFrame(structured, title)];
  try {
    return [inferFrame(JSON.parse(text), title)];
  } catch {
    return [textFrame(text, title)];
  }
}
