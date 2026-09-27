/**
 * Fill in a tool's arguments: the LLM writes them from the message and what the conversation already knows.
 * Then values nobody gave are dropped, and required ones still missing are reported, so the engine asks instead of guessing.
 */
import { z } from "zod";
import { yes, type SystemOne } from "./systemone.ts";
import type { Args, InputField, LLM, ToolInfo } from "./types.ts";

export interface Filled { args: Args; dropped: string[]; missing: InputField[]; ms: number }

/** What the LLM gets besides the message. `previous` are the focused tile's arguments when it's the same tool. */
export interface Context { message: string; previous?: Args; known?: Args; me?: Args; contents?: string }

export async function fill(tool: ToolInfo, c: Context, llm: LLM, s1: SystemOne): Promise<Filled> {
  const t0 = Date.now();
  const props = tool.inputSchema.properties ?? {};
  // Only the remembered values whose names this tool actually takes.
  const known = Object.fromEntries(Object.entries(c.known ?? {}).filter(([k, v]) => k in props && v != null && typeof v !== "object"));
  const facts = [
    `Previous arguments: ${c.previous ? JSON.stringify(c.previous) : "none"}`,
    Object.keys(known).length ? `Values used earlier in this conversation (use them when the message refers to the same thing or doesn't say): ${JSON.stringify(known)}` : "",
    c.me ? `The user is ${JSON.stringify(c.me)}. "my", "mine" and "me" refer to this user.` : "",
    c.contents ? `What this source contains (use only these names):\n${c.contents}` : "",
  ].filter(Boolean);
  const args: Args = { ...c.previous };
  if (Object.keys(props).length) {
    const out = z.record(z.string(), z.unknown()).catch({}).parse(await llm.json(
      `You fill in the arguments for the tool "${tool.title}": ${tool.description}\n` +
        `The arguments must match this JSON Schema:\n${JSON.stringify(tool.inputSchema)}\n` +
        `Reply with the arguments as a JSON object and nothing else. If the message doesn't mention a value, keep the previous value or use a sensible default. ` +
        `"what about X?", "and in X?" or "now X" means replace the previous value with X. ` +
        `"compare with X", "X vs Y", "X and Y" or "add X" means include both.`,
      [...facts, "If a required value is unknown, leave it out rather than inventing one.",
        "If you write a query, return readable columns (names, titles) alongside any ids.", `Message: ${c.message}`].join("\n"),
    ));
    for (const k of Object.keys(props)) if (out[k] != null) args[k] = out[k];
  }
  // Values nobody gave: small LLMs fill "owner" with a famous repo rather than leave it empty.
  const dropped = await ungrounded(tool, args, c.message, [known, c.me, c.previous], s1);
  for (const k of dropped) delete args[k];
  // Required values the LLM left out but the conversation already has ("and the issues?" after naming a repo).
  for (const k of tool.inputSchema.required ?? []) if ((args[k] == null || args[k] === "") && known[k] != null) args[k] = known[k];
  return { args, dropped, missing: missing(tool, args), ms: Date.now() - t0 };
}

/**
 * Text arguments nothing supports. A value counts as made up only when (1) none of its words appear in the message,
 * the conversation or the user's identity, and (2) System One, asked "Does the message say which <argument> to use?",
 * says no. (1) alone would reject good conversions like "Apple" → "AAPL"; (2) keeps them. Allowed values are never dropped.
 */
async function ungrounded(tool: ToolInfo, args: Args, message: string, context: unknown[], s1: SystemOne): Promise<string[]> {
  const props = tool.inputSchema.properties ?? {};
  const seen = (message + " " + JSON.stringify(context)).toLowerCase();
  const suspects = Object.entries(args).filter(([k, v]) => {
    if (v == null || v === "" || props[k]?.enum?.includes(v) || props[k]?.default === v) return false;
    // Required numbers are ids (an issue number): invented ones look just as plausible as real ones.
    // Optional numbers are usually conversions ("last 3 months" → days: 90) and are left alone.
    if (typeof v === "number") return !!tool.inputSchema.required?.includes(k) && !new RegExp(`(^|\\D)${v}(\\D|$)`).test(seen);
    const words = typeof v === "string" ? v.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3) : [];
    return words.length > 0 && !words.some((w) => seen.includes(w));
  }).map(([k]) => k);
  if (!suspects.length) return [];
  const about = (k: string) => {
    const d = props[k]?.description;
    return d ? `${d.split(/(?<=[.!?])\s/)[0].replace(/\.$/, "").toLowerCase()} (${k})` : k.replace(/_/g, " ");
  };
  const a = await s1.decide(message, Object.fromEntries(suspects.map((k, i) => [`q${i}`, `Does the message say which ${about(k)} to use?`])));
  return suspects.filter((_, i) => yes(a, `q${i}`) < 0.5);
}

/** A value an LLM writes when it doesn't know: "<owner>", "unknown", "your_username"… */
const PLACEHOLDER = /^(<.*>|\{.*\}|unknown|none|null|n\/a|tbd|\?+|your[_ -].*|example.*|placeholder.*)$/i;

function missing(tool: ToolInfo, args: Args): InputField[] {
  const props = tool.inputSchema.properties ?? {};
  return (tool.inputSchema.required ?? [])
    .filter((k) => args[k] == null || args[k] === "" || (typeof args[k] === "string" && PLACEHOLDER.test(args[k].trim())))
    .map((k) => ({ name: k, description: props[k]?.description, type: props[k]?.type, enum: props[k]?.enum?.map(String) }));
}
