/**
 * Hints: what the LLM should know about a server before it writes a tool's arguments. Each is learned once
 * per connection by calling the server's own read-only tools, so nothing here is written for one server.
 */
import { labelField, type Frame, type Value } from "./frame.ts";
import type { EngineEvent, ToolInfo, ToolRunner } from "./types.ts";

type Step = (who: string, text: string, ms?: number) => EngineEvent;

/**
 * "my …", "do I …": who the user is on this server, from its "who am I" tool (get_me, whoami, current_user, viewer…).
 * The first record it returns, reduced to short values (login, name, …).
 */
export async function* identity(runner: ToolRunner, tools: ToolInfo[], tool: ToolInfo, step: Step): AsyncGenerator<EngineEvent, Record<string, Value> | undefined> {
  const idTool = !isIdentityTool(tool) ? tools.find((t) => t.server === tool.server && t.autoRun && isIdentityTool(t)) : undefined;
  if (!idTool) return;
  const t0 = Date.now();
  const me = await runner.memo(tool.server, "identity", async () => {
    const [f] = await runner.call(idTool.id, {});
    const label = f && labelField(f)?.name;
    const short = Object.entries(f?.rows[0] ?? {}).filter(([, v]) => v != null && String(v).length <= 60 && !/^https?:/.test(String(v)));
    if (label) short.sort(([a], [b]) => (a === label ? -1 : b === label ? 1 : 0));
    return Object.fromEntries(short.slice(0, 8));
  });
  yield step(tool.server, `${idTool.name} → you are ${Object.values(me)[0] ?? "?"}`, Date.now() - t0);
  return me;
}

export function isIdentityTool(t: ToolInfo) {
  if (!t.readOnly || t.inputSchema.required?.length) return false;
  return /(^|[_\-.])(me|whoami|current_?user|viewer|self|my_?(profile|account|user))($|[_\-.])/i.test(t.name)
    || /\b(authenticated|current|logged[- ]in|signed[- ]in) user\b|\bwho (i am|you are)\b/i.test(t.description);
}

const LISTS = /^(list|show|get)[_-]?(tables|schemas?|collections|databases|datasets|allowed[_-]?directories|indexes|metrics|entities|models|views|buckets|projects)$/i;
const DESCRIBES = /^(describe|show[_-]?columns|get[_-]?(table[_-]?)?schema|table[_-]?info|get[_-]?columns)/i;

/**
 * What a server contains (its tables and their columns, the folders it can see…), so the LLM writes queries against
 * things that exist: read-only tools with no required arguments named like list_tables / list_allowed_directories,
 * then, for each name they return (up to 8), a read-only "describe_*" tool with one required argument.
 */
export async function* contents(runner: ToolRunner, tools: ToolInfo[], server: string, step: Step): AsyncGenerator<EngineEvent, string> {
  const t0 = Date.now();
  const text = await runner.memo(server, "contents", async () => {
    const mine = tools.filter((t) => t.server === server && t.readOnly);
    const lists = mine.filter((t) => !t.inputSchema.required?.length && (LISTS.test(t.name) || /\b(list|lists) (all )?(tables|schemas|collections|allowed directories)\b/i.test(t.description))).slice(0, 2);
    const describe = mine.find((t) => t.inputSchema.required?.length === 1 && DESCRIBES.test(t.name));
    const first = async (toolId: string, args = {}) => (await runner.call(toolId, args).catch((): Frame[] => []))[0];
    const names = (f?: Frame) => {
      const col = f && ((f.labelField && f.fields.find((x) => x.name === f.labelField)) || f.fields.find((x) => x.type === "string"));
      return col ? f.rows.map((r) => String(r[col.name] ?? "")).filter(Boolean) : [];
    };
    const parts = await Promise.all(lists.map(async (l) => {
      const found = names(await first(l.id)).slice(0, 20);
      if (!found.length || !describe) return found.length ? `${l.title}: ${found.join(", ")}` : "";
      // A describe tool usually returns one row per column; name the columns.
      const described = await Promise.all(found.slice(0, 8).map(async (n) => {
        const cols = names(await first(describe.id, { [describe.inputSchema.required![0]]: n }));
        return cols.length ? `${n}(${cols.join(", ")})` : n;
      }));
      return `${l.title}: ${described.join("; ")}`;
    }));
    return parts.filter(Boolean).join("\n").slice(0, 2500);
  });
  if (text && Date.now() - t0 > 50) yield step(server, `learned what it contains: ${text.split("\n").map((l) => l.split(":")[0]).join(", ")}`, Date.now() - t0);
  return text;
}
