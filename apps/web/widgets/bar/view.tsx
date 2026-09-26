"use client";

import { fieldsOf, labelField, type Frame } from "@glance/core";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { color, fmtCompact, fmtNumber, fmtTime, withUnit } from "../format.ts";

export default function BarView({ frame }: { frame: Frame }) {
  const time = frame.fields.find((f) => f.type === "time");
  const x = time ?? labelField(frame)!;
  const nums = fieldsOf(frame, "number").slice(0, 4);
  const keys = nums.map((_, i) => `s${i}`);
  const data = frame.rows.slice(0, 40).map((r) => ({ x: r[x.name], ...Object.fromEntries(nums.map((f, i) => [keys[i], r[f.name]])) }));
  const config: ChartConfig = Object.fromEntries(nums.map((f, i) => [keys[i], { label: withUnit(f), color: color(i) }]));
  const fmtX = (v: unknown) => (time ? fmtTime(v as string) : String(v ?? "").slice(0, 14));

  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="x" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} tickFormatter={fmtX} interval="preserveStartEnd" />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={fmtCompact} />
        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent labelFormatter={(_, p) => fmtX(p?.[0]?.payload?.x)} formatter={(v, name) => (
          <div className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{config[name as string]?.label}</span><span className="font-mono tabular-nums">{fmtNumber(v as number)}</span></div>
        )} />} />
        {nums.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {keys.map((k) => <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={4} animationDuration={600} />)}
      </BarChart>
    </ChartContainer>
  );
}
