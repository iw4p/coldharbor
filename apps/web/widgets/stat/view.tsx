"use client";

import { labelField, measures, type Frame } from "@coldharbor/core";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "cn";
import { fmtNumber } from "../format.ts";

/**
 * One card per row (label + main number + % change if present),
 * or, for a single row, one card per number.
 */
export default function StatView({ frame }: { frame: Frame }) {
  const nums = measures(frame);
  const pctField = nums.find((f) => f.unit === "%");
  const main = nums.filter((f) => f !== pctField);
  const label = labelField(frame);
  const unitField = frame.fields.find((f) => f.type === "string" && f.name === "unit");

  const cards = frame.rows.length === 1
    ? main.map((f) => ({ label: `${label ? `${frame.rows[0][label.name]} · ` : ""}${f.label ?? f.name}`, value: frame.rows[0][f.name], unit: f.unit, delta: pctField ? frame.rows[0][pctField.name] : null }))
    : frame.rows.map((r) => ({ label: String(label ? r[label.name] : ""), value: r[main[0]?.name], unit: main[0]?.unit ?? (unitField ? String(r[unitField.name]) : ""), delta: pctField ? r[pctField.name] : null }));

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
      {cards.map((c, i) => (
        <motion.div key={c.label + i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
          className="rounded-lg border bg-muted/30 px-3 py-2.5">
          <div className="truncate text-xs text-muted-foreground">{c.label}</div>
          <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">
            {fmtNumber(c.value)}<span className="ml-1 text-sm font-normal text-muted-foreground">{c.unit}</span>
          </div>
          {typeof c.delta === "number" && (
            <div className={cn("mt-0.5 flex items-center gap-0.5 text-xs tabular-nums", c.delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
              {c.delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(c.delta).toFixed(1)}% {pctField?.label ?? ""}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
