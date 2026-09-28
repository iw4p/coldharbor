"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, CircleAlert, Loader2, ShieldAlert, Target, X } from "lucide-react";
import { cn } from "cn";
import type { Intent, Run } from "@/core/canvas.ts";
import type { EngineEvent, Step, Tile } from "@/core/types.ts";
import { Button } from "@/components/ui/button";

const EXAMPLES = [
  "What's the weather in Berlin this week?",
  "show it as a table",
  "bitcoin price over the last 30 days",
  "which coins are trending right now?",
  "top stories on Hacker News",
  "latest Show HN posts",
  "air quality in Delhi today",
];

interface Props {
  runs: Run[];
  busy: boolean;
  /** The run a request is working on. */
  active?: string;
  focus?: Tile;
  send(intent: Intent): void;
  onClearFocus(): void;
  onShowTile(id: string): void;
}

export function Chat({ runs, busy, active, focus, send, onClearFocus, onShowTile }: Props) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [runs]);

  const ask = (t = text) => {
    if (!t.trim() || busy) return;
    send({ ask: t.trim(), focus: focus?.id });
    setText("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!runs.length && <p className="pt-6 text-sm text-muted-foreground">Ask for anything your connected sources know. Results appear on the canvas; follow up to change them.</p>}
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {runs.map((r) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">{r.message}</div>
                </div>
                <RunView run={r} running={active === r.id} busy={busy} focus={focus} send={send} onShowTile={onShowTile} />
              </motion.div>
            ))}
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
            <button key={e} disabled={busy} onClick={() => ask(e)} className="shrink-0 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-solid hover:text-foreground disabled:opacity-50">
              {e}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex items-end gap-2 rounded-2xl border bg-background p-1.5 pl-3.5 shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
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

/** How a tile (or an answer) was made, step by step. Also shown on the tile as "Why this?". */
export function Trace({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => (
        <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2 text-xs">
          <span className="w-20 shrink-0 truncate font-medium text-foreground/80">{s.who}</span>
          <span className="min-w-0 flex-1 break-words text-muted-foreground">{s.text}</span>
          {s.ms != null && <span className="shrink-0 tabular-nums text-muted-foreground/70">{s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`}</span>}
        </motion.li>
      ))}
    </ol>
  );
}

/** A run is its steps, then its outcome: the last event that isn't a step. */
function RunView({ run, running, busy, focus, send, onShowTile }: { run: Run; running: boolean; busy: boolean; focus?: Tile; send(i: Intent): void; onShowTile(id: string): void }) {
  const steps = run.events.flatMap((e) => (e.type === "step" ? [e.step] : []));
  const last = running ? undefined : run.events.findLast((e): e is Exclude<EngineEvent, { type: "step" }> => e.type !== "step");
  return (
    <>
      <Trace steps={steps} />
      {running && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span className="animate-pulse">{["routing", "filling in details", "fetching data", "choosing a view"][Math.min(steps.length, 3)]}…</span>
        </div>
      )}
      {last?.type === "tile" && <button onClick={() => onShowTile(last.tile.id)} className="text-xs text-primary/80 underline-offset-2 hover:underline">→ on the canvas</button>}
      {(last?.type === "say" || last?.type === "error") && (
        <div className={cn("flex gap-2 rounded-lg px-3 py-2 text-sm", last.type === "error" ? "bg-destructive/10 text-destructive" : "bg-muted")}>
          {last.type === "error" && <CircleAlert className="mt-0.5 size-4 shrink-0" />}
          <span className={cn("min-w-0 break-words", last.type === "error" && "line-clamp-4")}>{last.type === "error" ? last.message : last.text}</span>
        </div>
      )}
      {last?.type === "confirm" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
            Run <span className="font-mono text-xs">{last.call.toolId}</span>?
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{last.readOnly ? "This tool isn't set to run automatically." : "This tool can change things. Check the arguments first."}</p>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-background/70 p-2 text-[11px]">{JSON.stringify(last.call.args, null, 2)}</pre>
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" className="h-7" disabled={busy} onClick={() => send({ run: run.id, approve: {} })}>Run it</Button>
            <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => send({ run: run.id, cancel: true })}>Cancel</Button>
          </div>
        </div>
      )}
      {last?.type === "needs-input" && <NeedsInput ask={last} busy={busy} onRun={(values) => send({ run: run.id, approve: values })} onCancel={() => send({ run: run.id, cancel: true })} />}
      {last?.type === "clarify" && (
        <div className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm">
          {last.question}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {last.options.map((o) => (
              <Button key={o.toolId} size="sm" variant="outline" className="h-7 rounded-full" disabled={busy} onClick={() => send({ run: run.id, choose: o.toolId, focus: focus?.id })}>
                {o.label} <span className="tabular-nums text-muted-foreground">{Math.round(o.p * 100)}%</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** A small form for required arguments nobody gave, built from the tool's input schema. */
function NeedsInput({ ask, busy, onRun, onCancel }: { ask: Extract<EngineEvent, { type: "needs-input" }>; busy: boolean; onRun(values: Record<string, unknown>): void; onCancel(): void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const ready = ask.fields.every((f) => values[f.name]?.trim());
  const submit = () => onRun(Object.fromEntries(ask.fields.map((f) => {
    const v = values[f.name].trim();
    return [f.name, f.type === "number" || f.type === "integer" ? Number(v) : f.type === "boolean" ? v === "true" : v];
  })));
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ready) submit(); }} className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
      <div className="font-medium">{ask.title} needs a bit more</div>
      <div className="mt-2 space-y-2">
        {ask.fields.map((f, i) => (
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
      {!ask.readOnly && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">This tool can change things; it runs only when you press Run.</p>}
      <div className="mt-2 flex gap-1.5">
        <Button type="submit" size="sm" className="h-7" disabled={busy || !ready}>Run</Button>
        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
