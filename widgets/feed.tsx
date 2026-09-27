"use client";

import { labelField, type Frame } from "@/core/frame.ts";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { timeAgo } from "./format.ts";

/** A list of linked items: headlines, issues, posts… */
export default function FeedView({ frame }: { frame: Frame }) {
  const title = labelField(frame)!.name;
  const url = frame.fields.find((f) => f.type === "url")!.name;
  const time = frame.fields.find((f) => f.type === "time")?.name;
  const group = frame.groupField;
  // Short strings make good meta; yes/no flags don't ("yes" alone means nothing under a headline).
  const flag = (n: string) => frame.rows.every((r) => r[n] == null || r[n] === "yes" || r[n] === "no");
  const meta = frame.fields.filter((f) => f.type === "string" && f.name !== title && f.name !== group && !flag(f.name)).slice(0, 3).map((f) => f.name);

  return (
    <ScrollArea className="h-[260px] pr-3">
      <ul className="divide-y">
        {frame.rows.slice(0, 60).map((r, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }} className="py-2">
            <a href={String(r[url])} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-medium leading-snug hover:underline">
              {String(r[title])}
            </a>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {group && r[group] && <Badge variant="outline" className="h-4 px-1.5 text-[10px] capitalize">{String(r[group]).toLowerCase()}</Badge>}
              {time && <span>{timeAgo(r[time])}</span>}
              {meta.map((m) => r[m] && <span key={m} className="truncate">{String(r[m])}</span>)}
            </div>
          </motion.li>
        ))}
      </ul>
    </ScrollArea>
  );
}
