"use client";

import { measures, type Frame, type Value } from "@coldharbor/core";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { color, fmtCompact, fmtNumber, fmtTime, rebase, shouldRebase, withUnit } from "../format.ts";

export default function LineView({ frame }: { frame: Frame }) {
  const time = frame.fields.find((f) => f.type === "time")!;
  const nums = measures(frame).slice(0, 6);
  // Recharts keys become CSS variable names, so use safe ones.
  const keys = nums.map((_, i) => `s${i}`);
  let data: Record<string, Value>[] = frame.rows.map((r) => ({ t: r[time.name], ...Object.fromEntries(nums.map((f, i) => [keys[i], r[f.name]])) }));
  const rebased = shouldRebase(data, keys);
  if (rebased) data = rebase(data, keys);
  const config: ChartConfig = Object.fromEntries(nums.map((f, i) => [keys[i], { label: rebased ? f.label ?? f.name : withUnit(f), color: color(i) }]));

  return (
    <div>
      <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
        <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={fmtTime} />
          <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (rebased ? `${v}%` : fmtCompact(v))} domain={["auto", "auto"]} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => fmtTime(p?.[0]?.payload?.t)} formatter={(v, name) => (
            <div className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{config[name as string]?.label}</span><span className="font-mono tabular-nums">{rebased ? `${v}%` : fmtNumber(v as number)}</span></div>
          )} />} />
          {nums.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
          {keys.map((k) => (
            <Line key={k} dataKey={k} type="monotone" stroke={`var(--color-${k})`} strokeWidth={2} dot={data.length <= 31 ? { r: 2 } : false} connectNulls animationDuration={700} />
          ))}
        </LineChart>
      </ChartContainer>
      {rebased && <p className="mt-1 text-xs text-muted-foreground">Shown as % change from the start so different price levels compare. Switch to Table for raw values.</p>}
    </div>
  );
}
