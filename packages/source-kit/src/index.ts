/**
 * defineSource(): the smallest way to write a Glance source.
 *
 *   defineSource({
 *     name: "weather",
 *     tools: {
 *       forecast: {
 *         title: "Weather forecast",
 *         description: "Temperature, rain and wind for one or more cities",
 *         input: { cities: z.array(z.string()) },
 *         run: async ({ cities }) => ({ title: "…", fields: […], rows: […] }),
 *       },
 *     },
 *   }).start();
 *
 * The result is a normal MCP server over stdio. Glance draws its frames as widgets;
 * any other MCP client (Claude Desktop, Cursor, …) gets a readable text table.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, type ZodRawShape } from "zod";
import type { Field, Frame } from "@glance/core";

export { z };
export type { Field, Frame };

export interface ToolDef<S extends ZodRawShape> {
  title: string;
  /** Written for a router: say what data this returns and give examples of what users ask. */
  description: string;
  input: S;
  run: (args: z.infer<z.ZodObject<S>>) => Promise<Frame | Frame[]>;
}

export interface SourceDef {
  name: string;
  version?: string;
  tools: Record<string, ToolDef<any>>;
}

/** Helps type inference for a single tool. */
export const tool = <S extends ZodRawShape>(def: ToolDef<S>) => def;

export function defineSource(def: SourceDef) {
  const server = new McpServer({ name: def.name, version: def.version ?? "0.1.0" });
  for (const [name, t] of Object.entries(def.tools)) {
    server.registerTool(
      name,
      { title: t.title, description: t.description, inputSchema: t.input, outputSchema: { frames: z.array(z.any()) } },
      async (args: Record<string, unknown>) => {
        try {
          const frames = ([] as Frame[]).concat(await t.run(args));
          return { content: [{ type: "text" as const, text: frames.map(toText).join("\n\n") }], structuredContent: { frames } };
        } catch (e) {
          return { isError: true, content: [{ type: "text" as const, text: String((e as Error)?.message ?? e) }] };
        }
      },
    );
  }
  return {
    server,
    async start() {
      await server.connect(new StdioServerTransport());
    },
  };
}

/** A compact text table, for MCP clients that show text rather than widgets. */
function toText(f: Frame, maxRows = 25): string {
  const head = f.fields.map((x) => (x.unit ? `${x.label ?? x.name} (${x.unit})` : x.label ?? x.name));
  const rows = f.rows.slice(0, maxRows).map((r) => f.fields.map((x) => String(r[x.name] ?? "")));
  const more = f.rows.length > maxRows ? `\n… ${f.rows.length - maxRows} more rows` : "";
  return `# ${f.title}${f.subtitle ? `\n${f.subtitle}` : ""}\n${head.join(" | ")}\n${rows.map((r) => r.join(" | ")).join("\n")}${more}`;
}

/** fetch() with one retry on network errors, and a readable error on non-2xx responses. */
export async function getJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const opts = { ...init, headers: { "user-agent": "glance-source/0.1", ...init?.headers } };
  const res = await fetch(url, opts).catch(async () => {
    await new Promise((r) => setTimeout(r, 800));
    return fetch(url, opts);
  });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json() as Promise<T>;
}

export const day = (d: number | string | Date) => new Date(d).toISOString().slice(0, 10);
