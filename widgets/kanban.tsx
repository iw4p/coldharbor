"use client";

import { labelField, type Frame } from "@/core/frame.ts";
import { motion } from "motion/react";
import { timeAgo } from "./format.ts";

export default function KanbanView({ frame }: { frame: Frame }) {
  const group = frame.groupField!;
  const title = labelField(frame)?.name;
  const url = frame.fields.find((f) => f.type === "url")?.name;
  const time = frame.fields.find((f) => f.type === "time")?.name;
  const meta = frame.fields.find((f) => f.type === "string" && f.name !== title && f.name !== group)?.name;
  const columns = [...new Set(frame.rows.map((r) => String(r[group] ?? "—")))];

  return (
    <div className="flex h-[280px] gap-2 overflow-x-auto pb-1">
      {columns.map((c, ci) => {
        const items = frame.rows.filter((r) => String(r[group] ?? "—") === c);
        return (
          <div key={c} className="flex w-[220px] shrink-0 flex-col rounded-lg bg-muted/50 p-2">
            <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium capitalize">
              <span className="size-2 rounded-full" style={{ background: `var(--chart-${(ci % 5) + 1})` }} />
              {c.toLowerCase()} <span className="text-muted-foreground">{items.length}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {items.map((r, i) => {
                const text = String(title ? r[title] : "");
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}
                    className="rounded-md border bg-card p-2 text-xs shadow-xs">
                    {url && r[url] ? <a href={String(r[url])} target="_blank" rel="noopener noreferrer" className="line-clamp-3 font-medium hover:underline">{text}</a>
                      : <div className="line-clamp-3 font-medium">{text}</div>}
                    <div className="mt-1 flex gap-2 text-muted-foreground">
                      {meta && r[meta] && <span className="truncate">{String(r[meta])}</span>}
                      {time && <span className="ml-auto shrink-0">{timeAgo(r[time])}</span>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
