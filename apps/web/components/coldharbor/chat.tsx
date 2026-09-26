"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, CircleAlert, Loader2, ShieldAlert, Target, X } from "lucide-react";
import { cn } from "cn";
import type { Tile } from "@coldharbor/core";
import { Button } from "@/components/ui/button";
import type { AskOptions, Message } from "./use-coldharbor";

const EXAMPLES = [
  "What's the weather in Berlin this week?",
  "show it as a table",
  "weather in Paris, Rome and Madrid on a map",
  "How has Apple stock done this year?",
  "compare it with Nvidia",
  "bitcoin price right now",
  "latest news about electric cars",
  "EUR to USD and GBP over 3 months",
];

interface Props {
  messages: Message[];
  busy: boolean;
  focus?: Tile;
  onAsk(text: string, opts?: AskOptions): void;
  onCancel(runId: string): void;
  onClearFocus(): void;
  onShowTile(id: string): void;
}

export function Chat({ messages, busy, focus, onAsk, onCancel, onClearFocus, onShowTile }: Props) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const send = (t = text) => {
    if (!t.trim() || busy) return;
    onAsk(t.trim());
    setText("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!messages.length && (
          <div className="space-y-3 pt-6 text-sm text-muted-foreground">
            <p>Ask for anything your connected sources know. Results appear on the canvas; follow up to change them.</p>
          </div>
        )}
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {messages.map((m) =>
              m.role === "user" ? (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">{m.text}</div>
                </motion.div>
              ) : (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
                  <ol className="space-y-1">
                    {m.steps.map((s, i) => (
                      <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2 text-xs">
                        <span className="w-14 shrink-0 font-medium text-foreground/80">{s.who}</span>
                        <span className="min-w-0 flex-1 break-words text-muted-foreground">{s.text}</span>
                        {s.ms != null && <span className="shrink-0 tabular-nums text-muted-foreground/70">{s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`}</span>}
                      </motion.li>
                    ))}
                  </ol>
                  {m.status === "running" && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      <span className="animate-pulse">{["routing", "filling in details", "fetching data", "choosing a view"][Math.min(m.steps.length, 3)]}…</span>
                    </div>
                  )}
                  {m.status === "done" && m.tileId && (
                    <button onClick={() => onShowTile(m.tileId!)} className="text-xs text-primary/80 underline-offset-2 hover:underline">→ on the canvas</button>
                  )}
                  {(m.status === "said" || m.status === "error") && (
                    <div className={cn("flex gap-2 rounded-lg px-3 py-2 text-sm", m.status === "error" ? "bg-destructive/10 text-destructive" : "bg-muted")}>
                      {m.status === "error" && <CircleAlert className="mt-0.5 size-4 shrink-0" />}
                      {m.text}
                    </div>
                  )}
                  {m.status === "confirm" && m.confirm && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
                      <div className="flex items-center gap-1.5 font-medium">
                        <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
                        Run <span className="font-mono text-xs">{m.confirm.toolId}</span>?
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {m.confirm.readOnly ? "This tool isn't set to run automatically." : "This tool can change things. Check the arguments first."}
                      </p>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-background/70 p-2 text-[11px]">{JSON.stringify(m.confirm.args, null, 2)}</pre>
                      <div className="mt-2 flex gap-1.5">
                        <Button size="sm" className="h-7" disabled={busy} onClick={() => onAsk(m.message, { confirmed: { toolId: m.confirm!.toolId, args: m.confirm!.args }, replyTo: m.id })}>Run it</Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => onCancel(m.id)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                  {m.status === "needs-input" && m.needsInput && (
                    <NeedsInput run={m.needsInput} busy={busy} onRun={(args) => onAsk(m.message, { confirmed: { toolId: m.needsInput!.toolId, args }, replyTo: m.id })} onCancel={() => onCancel(m.id)} />
                  )}
                  {m.status === "cancelled" && <div className="text-xs text-muted-foreground">Cancelled. Nothing was run.</div>}
                  {m.status === "clarify" && m.clarify && (
                    <div className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm">
                      {m.clarify.question}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.clarify.options.map((o) => (
                          <Button key={o.toolId} size="sm" variant="outline" className="h-7 rounded-full" onClick={() => onAsk(m.message, { forceTool: o.toolId, replyTo: m.id })}>
                            {o.label} <span className="tabular-nums text-muted-foreground">{Math.round(o.p * 100)}%</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ),
            )}
          </AnimatePresence>
        </div>
        <div ref={end} />
      </div>

      <div className="border-t p-3">
        <AnimatePresence>
          {focus && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-2 overflow-hidden">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Target className="size-3.5" />
                <span className="truncate">Follow-ups go to <span className="font-medium text-foreground">{focus.title}</span></span>
                <button onClick={onClearFocus} className="ml-auto rounded p-0.5 hover:bg-muted" aria-label="Start fresh"><X className="size-3.5" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {EXAMPLES.map((e) => (
            <button key={e} disabled={busy} onClick={() => send(e)} className="shrink-0 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-solid hover:text-foreground disabled:opacity-50">
              {e}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 rounded-2xl border bg-background p-1.5 pl-3.5 shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder="Ask for data…"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" className="size-9 shrink-0 rounded-xl" disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

/** A small form for required arguments nobody gave, built from the tool's input schema. */
function NeedsInput({ run, busy, onRun, onCancel }: {
  run: NonNullable<Extract<Message, { role: "run" }>["needsInput"]>;
  busy: boolean;
  onRun(args: Record<string, unknown>): void;
  onCancel(): void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const ready = run.fields.every((f) => values[f.name]?.trim());
  const submit = () => {
    const filled = Object.fromEntries(run.fields.map((f) => {
      const v = values[f.name].trim();
      return [f.name, f.type === "number" || f.type === "integer" ? Number(v) : f.type === "boolean" ? v === "true" : v];
    }));
    onRun({ ...run.args, ...filled });
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ready) submit(); }} className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
      <div className="font-medium">{run.title} needs a bit more</div>
      <div className="mt-2 space-y-2">
        {run.fields.map((f, i) => (
          <label key={f.name} className="block">
            <span className="text-xs text-muted-foreground">{f.name.replace(/_/g, " ")}{f.description ? ` · ${f.description.slice(0, 90)}` : ""}</span>
            {f.enum?.length ? (
              <select className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                <option value="" disabled>Choose…</option>
                {f.enum.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input autoFocus={i === 0} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      {!run.readOnly && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">This tool can change things; it runs only when you press Run.</p>}
      <div className="mt-2 flex gap-1.5">
        <Button type="submit" size="sm" className="h-7" disabled={busy || !ready}>Run</Button>
        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
