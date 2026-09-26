"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, CircleAlert, Loader2, Target, X } from "lucide-react";
import { cn } from "cn";
import type { Tile } from "@coldharbor/core";
import { Button } from "@/components/ui/button";
import type { Message } from "./use-coldharbor";

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
  onAsk(text: string, forceTool?: string, replyTo?: string): void;
  onClearFocus(): void;
  onShowTile(id: string): void;
}

export function Chat({ messages, busy, focus, onAsk, onClearFocus, onShowTile }: Props) {
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
                  {m.status === "clarify" && m.clarify && (
                    <div className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm">
                      {m.clarify.question}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.clarify.options.map((o) => (
                          <Button key={o.toolId} size="sm" variant="outline" className="h-7 rounded-full" onClick={() => onAsk(m.message, o.toolId, m.id)}>
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
