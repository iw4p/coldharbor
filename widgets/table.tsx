"use client";

import type { Frame } from "@/core/frame.ts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtNumber, fmtTime, withUnit } from "./format.ts";

export default function TableView({ frame }: { frame: Frame }) {
  // Long text belongs in the details view, not in a cell.
  const fields = frame.fields.filter((f) => f.type !== "lat" && f.type !== "lon" && f.type !== "text");
  const url = frame.fields.find((f) => f.type === "url")?.name;
  const cell = (f: (typeof fields)[number], v: unknown, row: Record<string, unknown>) => {
    if (f.type === "number") return fmtNumber(v as number);
    if (f.type === "time") return fmtTime(v as string);
    if (f.type === "url") return null;
    if (url && f.name === frame.labelField) return <a href={String(row[url])} target="_blank" rel="noopener noreferrer" className="hover:underline">{String(v ?? "")}</a>;
    return String(v ?? "–");
  };
  const shown = fields.filter((f) => f.type !== "url" || !frame.labelField);

  return (
    <div className="max-h-[260px] overflow-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow>{shown.map((f) => <TableHead key={f.name} className={f.type === "number" ? "text-right" : ""}>{withUnit(f)}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {frame.rows.slice(0, 200).map((r, i) => (
            <TableRow key={i}>
              {shown.map((f) => (
                <TableCell key={f.name} className={f.type === "number" ? "text-right font-mono tabular-nums" : f.name === frame.labelField ? "max-w-[340px] truncate" : "whitespace-nowrap"}>
                  {cell(f, r[f.name], r)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
