"use client";

import type { Frame } from "@coldharbor/core";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "../markdown";

export default function TextView({ frame }: { frame: Frame }) {
  return (
    <ScrollArea className="h-[280px] pr-3">
      <Markdown>{String(frame.rows[0]?.text ?? "")}</Markdown>
    </ScrollArea>
  );
}
