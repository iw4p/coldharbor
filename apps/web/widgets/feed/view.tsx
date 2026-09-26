"use client";

import { labelField, type Frame } from "@coldharbor/core";
import { motion } from "motion/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { timeAgo } from "../format.ts";

/** A list of linked items: headlines, issues, posts… */
export default function FeedView({ frame }: { frame: Frame }) {
  const title = labelField(frame)!.name;
  const url = frame.fields.find((f) => f.type === "url")!.name;
  const time = frame.fields.find((f) => f.type === "time")?.name;
  const meta = frame.fields.filter((f) => f.type === "string" && f.name !== title).map((f) => f.name);

  return (
    <ScrollArea className="h-[260px] pr-3">
      <ul className="divide-y">
        {frame.rows.slice(0, 60).map((r, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }} className="py-2">
            <a href={String(r[url])} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-medium leading-snug hover:underline">
              {String(r[title])}
            </a>
            <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
              {time && <span>{timeAgo(r[time])}</span>}
              {meta.map((m) => r[m] && <span key={m} className="truncate">{String(r[m])}</span>)}
            </div>
          </motion.li>
        ))}
      </ul>
    </ScrollArea>
  );
}
