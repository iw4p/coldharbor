import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { inferFrames, isFrame, type Frame } from "./frame.ts";
import type { Args, ToolInfo, ToolRunner } from "./types.ts";

/** Same shape as Claude Desktop / Cursor `mcpServers` entries, so configs can be copied across. */
type Common = {
  disabled?: boolean;
  /** Which tools run without asking: "read-only" (default), "all", or "never". */
  autoRun?: "read-only" | "all" | "never";
  /** Set by the config loader: environment variables the entry uses that aren't set. */
  missing?: string[];
};
export type ServerConfig =
  | ({ command: string; args?: string[]; env?: Record<string, string>; cwd?: string } & Common)
  | ({ url: string; headers?: Record<string, string> } & Common);

/** For servers that don't annotate their tools: names that only read. */
const READ_NAME = /^(get|list|search|read|fetch|find|show|describe|query|lookup|view|count|browse|check|download|export)(_|-|[A-Z]|$)/i;

export interface ServerStatus {
  name: string;
  state: "connecting" | "ready" | "error" | "disabled" | "needs-setup";
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
    for (const [name, s] of Object.entries(servers)) {
      const state = s.disabled ? "disabled" : s.missing?.length ? "needs-setup" : "connecting";
      this.status.set(name, { name, state, tools: [], ...(state === "needs-setup" ? { error: `set ${s.missing!.join(", ")} (environment or .env.local)` } : {}) });
    }
  }

  private connect(name: string): Promise<Client> {
    let c = this.clients.get(name);
    if (!c) {
      c = (async () => {
        const cfg = this.servers[name];
        const client = new Client({ name: "coldharbor", version: "0.1.0" });
        const stdio = "url" in cfg ? undefined
          : new StdioClientTransport({ command: cfg.command, args: cfg.args, cwd: cfg.cwd ?? this.root, env: { ...getDefaultEnvironment(), ...cfg.env }, stderr: "pipe" });
        const transport = stdio ?? new StreamableHTTPClientTransport(new URL((cfg as { url: string }).url), { requestInit: { headers: (cfg as { headers?: Record<string, string> }).headers } });
        // Keep the last lines a server wrote to stderr: when it crashes, that's the explanation.
        const log: string[] = [];
        stdio?.stderr?.on("data", (b: Buffer) => { log.push(...b.toString().split("\n").filter(Boolean)); log.splice(0, Math.max(0, log.length - 20)); });
        const why = () => log.filter((l) => /error|exception|not found|denied|refused|invalid|missing/i.test(l)).at(-1) ?? log.at(-1);
        transport.onclose = () => {
          this.clients.delete(name);
          this.status.set(name, { name, state: "error", error: why() ? `stopped: ${why()!.trim().slice(0, 240)}` : "disconnected", tools: [] });
        };
        try {
          await client.connect(transport);
        } catch (e) {
          const detail = why();
          throw new Error(detail ? `${(e as Error).message} (${detail.trim().slice(0, 240)})` : (e as Error).message);
        }
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

  /** The raw MCP client for a server (for tools like `pnpm probe`). */
  client(name: string): Promise<Client> {
    return this.connect(name);
  }

  async list(): Promise<ToolInfo[]> {
    const names = Object.keys(this.servers).filter((n) => !this.servers[n].disabled && !this.servers[n].missing?.length);
    const lists = await Promise.all(names.map(async (server) => {
      try {
        const client = await this.connect(server);
        const { tools } = await client.listTools();
        const serverInfo = client.getInstructions()?.trim() || undefined;
        this.status.set(server, { name: server, state: "ready", tools: tools.map((t) => t.name) });
        const policy = this.servers[server].autoRun ?? "read-only";
        return tools.map((t): ToolInfo => {
          const a = t.annotations ?? {};
          const readOnly = a.readOnlyHint === true || (a.readOnlyHint === undefined && a.destructiveHint !== true && READ_NAME.test(t.name));
          return {
            id: `${server}.${t.name}`,
            server,
            name: t.name,
            title: t.title ?? a.title ?? t.name.replace(/[_-]/g, " "),
            description: t.description ?? "",
            serverInfo,
            inputSchema: t.inputSchema as ToolInfo["inputSchema"],
            readOnly,
            autoRun: policy === "all" || (policy === "read-only" && readOnly),
          };
        });
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
    // Text, and embedded resources (how some servers return file contents). When a server returns a
    // resource plus a short status line ("downloaded file…"), the resource is the answer.
    const content = (res.content as { type: string; text?: string; resource?: { text?: string } }[] | undefined) ?? [];
    const texts = content.filter((c) => c.type === "text" && c.text).map((c) => c.text!);
    const resources = content.filter((c) => c.type === "resource" && c.resource?.text).map((c) => c.resource!.text!);
    const text = (resources.length && texts.join("").length < 300 ? resources : [...texts, ...resources]).join("\n");
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
  // Structured content first; otherwise the text, which inferFrames parses when it's really data.
  return inferFrames(structured ?? text, title);
}
