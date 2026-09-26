"use client";

import { labelField, type Frame } from "@coldharbor/core";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fmtNumber, fmtTime } from "../format.ts";
import { Markdown } from "../markdown";

export default function DetailView({ frame }: { frame: Frame }) {
  const row = frame.rows[0] ?? {};
  const label = labelField(frame);
  const url = frame.fields.find((f) => f.type === "url");
  const group = frame.fields.find((f) => f.name === frame.groupField);
  const facts = frame.fields.filter((f) => f !== label && f !== url && f !== group && f.type !== "text" && row[f.name] != null && row[f.name] !== "");
  const texts = frame.fields.filter((f) => f.type === "text" && row[f.name]);
  const show = (v: unknown, type: string) => (type === "number" ? fmtNumber(v as number) : type === "time" ? fmtTime(v as string) : String(v));

  return (
    <ScrollArea className="h-[280px] pr-3">
      <div className="flex items-start gap-2">
        {label && <h3 className="flex-1 text-base font-semibold leading-snug">{String(row[label.name] ?? "")}</h3>}
        {group && row[group.name] && <Badge variant="outline" className="shrink-0 capitalize">{String(row[group.name]).toLowerCase()}</Badge>}
        {url && row[url.name] && (
          <a href={String(row[url.name])} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Open">
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {facts.map((f) => (
          <div key={f.name} className="contents">
            <dt className="text-muted-foreground">{f.label ?? f.name.replace(/_/g, " ")}</dt>
            <dd className="min-w-0 truncate tabular-nums">{show(row[f.name], f.type)}{f.unit ? ` ${f.unit}` : ""}</dd>
          </div>
        ))}
      </dl>
      {texts.map((f) => (
        <div key={f.name} className="mt-4 border-t pt-3">
          <Markdown>{String(row[f.name])}</Markdown>
        </div>
      ))}
    </ScrollArea>
  );
}
