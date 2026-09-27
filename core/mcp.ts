import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import type { ServerConfig } from "./config.ts";
import { Frame } from "./frame.ts";
import { inferFrames } from "./infer.ts";
import type { Args, JsonSchema, ToolInfo, ToolRunner } from "./types.ts";

/** For servers that don't annotate their tools: names that only read. */
const READ_NAME = /^(get|list|search|read|fetch|find|show|describe|query|lookup|view|count|browse|check|download|export)(_|-|[A-Z]|$)/i;

const Content = z.array(z.object({ type: z.string(), text: z.string().optional(), resource: z.object({ text: z.string().optional() }).optional() })).catch([]);
const Frames = z.object({ frames: z.array(Frame) });

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
  private memos = new Map<string, Promise<unknown>>();
  private servers: Record<string, ServerConfig>;
  private root: string;

  constructor(servers: Record<string, ServerConfig>, root: string) {
    this.servers = servers;
    this.root = root;
    for (const [name, s] of Object.entries(servers)) {
      const state = s.disabled ? "disabled" : s.missing?.length ? "needs-setup" : "connecting";
      this.status.set(name, { name, state, tools: [], error: state === "needs-setup" ? `set ${s.missing!.join(", ")} (environment or .env.local)` : undefined });
    }
  }

  private connect(name: string): Promise<Client> {
    let c = this.clients.get(name);
    if (c) return c;
    const cfg = this.servers[name];
    const transport = "command" in cfg
      ? new StdioClientTransport({ command: cfg.command, args: cfg.args, cwd: cfg.cwd ?? this.root, env: { ...getDefaultEnvironment(), ...cfg.env }, stderr: "pipe" })
      : new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers } });
    // Keep the last lines a server wrote to stderr: when it crashes, that's the explanation.
    const log: string[] = [];
    if (transport instanceof StdioClientTransport) transport.stderr?.on("data", (b: Buffer) => {
      log.push(...b.toString().split("\n").filter(Boolean));
      log.splice(0, log.length - 20);
    });
    const why = () => (log.filter((l) => /error|exception|not found|denied|refused|invalid|missing/i.test(l)).at(-1) ?? log.at(-1))?.trim().slice(0, 240);
    const fail = (error: string) => {
      this.clients.delete(name);
      for (const k of this.memos.keys()) if (k.startsWith(`${name}\0`)) this.memos.delete(k);
      this.status.set(name, { name, state: "error", error, tools: [] });
    };
    transport.onclose = () => fail(why() ? `stopped: ${why()}` : "disconnected");
    const client = new Client({ name: "coldharbor", version: "0.1.0" });
    c = client.connect(transport).then(() => client, (e: Error) => {
      const err = new Error(why() ? `${e.message} (${why()})` : e.message);
      fail(err.message);
      throw err;
    });
    this.clients.set(name, c);
    return c;
  }

  /** The raw MCP client for a server (for tools like `pnpm probe`). */
  client(name: string): Promise<Client> {
    return this.connect(name);
  }

  /** Remembers `make()` for this server until it disconnects. Failures aren't remembered. */
  memo<T>(server: string, key: string, make: () => Promise<T>): Promise<T> {
    const k = `${server}\0${key}`;
    if (!this.memos.has(k)) this.memos.set(k, make().catch((e) => (this.memos.delete(k), Promise.reject(e))));
    return this.memos.get(k) as Promise<T>;
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
            inputSchema: t.inputSchema as JsonSchema,
            readOnly,
            autoRun: policy === "all" || (policy === "read-only" && readOnly),
          };
        });
      } catch (e) {
        this.status.set(server, { name: server, state: "error", error: (e as Error).message, tools: [] });
        return [];
      }
    }));
    return lists.flat();
  }

  async call(toolId: string, args: Args): Promise<Frame[]> {
    const dot = toolId.indexOf(".");
    const res = await (await this.connect(toolId.slice(0, dot))).callTool({ name: toolId.slice(dot + 1), arguments: args });
    // Text, and embedded resources (how some servers return file contents). When a server returns a
    // resource plus a short status line ("downloaded file…"), the resource is the answer.
    const content = Content.parse(res.content);
    const texts = content.filter((c) => c.type === "text" && c.text).map((c) => c.text!);
    const resources = content.filter((c) => c.type === "resource" && c.resource?.text).map((c) => c.resource!.text!);
    const text = (resources.length && texts.join("").length < 300 ? resources : [...texts, ...resources]).join("\n");
    if (res.isError) throw new Error(text || `${toolId} failed`);
    // ColdHarbor sources return { frames }; anything else is converted as well as it can be.
    const own = Frames.safeParse(res.structuredContent);
    return own.success ? own.data.frames : inferFrames(res.structuredContent ?? text, toolId.slice(dot + 1));
  }

  serverStatus(): ServerStatus[] {
    return [...this.status.values()];
  }

  async close() {
    await Promise.all([...this.clients.values()].map(async (c) => (await c).close().catch(() => {})));
  }
}
