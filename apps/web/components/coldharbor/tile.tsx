"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MoreHorizontal, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { frameFor, rankWidgets, type Tile } from "@coldharbor/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { specs } from "@/widgets/specs.ts";
import { views } from "@/widgets/views";

interface Props {
  tile: Tile;
  focused: boolean;
  onFocus(): void;
  onWidget(id: string): void;
  onRemove(): void;
  onRefresh(): Promise<void>;
}

export function TileCard({ tile, focused, onFocus, onWidget, onRemove, onRefresh }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const spec = specs.find((s) => s.id === tile.widget) ?? specs[0];
  const frame = frameFor(spec, tile.frames) ?? tile.frames[0];
  const fits = rankWidgets(specs, tile.frames);
  const View = views[spec.id]?.View;
  const [server, tool] = [tile.toolId.slice(0, tile.toolId.indexOf(".")), tile.toolId.slice(tile.toolId.indexOf(".") + 1)];

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18, scale: 0.97, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.95, filter: "blur(6px)" }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      onPointerDown={onFocus}
    >
      <Card className={cn("gap-3 overflow-hidden py-4 transition-shadow", focused ? "shadow-lg ring-2 ring-primary/25" : "hover:shadow-md")}>
        <div className="flex items-start gap-2 px-4">
          <div className="min-w-0 flex-1">
            <motion.div key={frame.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="truncate font-medium leading-tight">{frame.title}</motion.div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary" className="h-5 rounded-md px-1.5 font-mono text-[10.5px]">{server}<span className="opacity-50">·</span>{tool}</Badge>
              {frame.subtitle && <span className="truncate">{frame.subtitle}</span>}
            </div>
          </div>

          <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
            {fits.map(({ id }) => {
              const Icon = views[id]?.icon;
              if (!Icon) return null;
              return (
                <Tooltip key={id}>
                  <TooltipTrigger
                    render={<button />}
                    onClick={() => onWidget(id)}
                    className={cn("relative grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground", id === spec.id && "text-foreground")}
                  >
                    {id === spec.id && <motion.span layoutId={`sel-${tile.id}`} className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                    <Icon className="relative size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>{specs.find((s) => s.id === id)?.name}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <Popover>
            <Tooltip>
              <TooltipTrigger render={<PopoverTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label="Why this?" />} />}>
                <Sparkles className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Why this?</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-[400px] text-xs">
              <div className="mb-2 font-medium">How this tile was made</div>
              <ol className="space-y-1.5">
                {tile.trace.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-16 shrink-0 font-medium">{s.who}</span>
                    <span className="min-w-0 flex-1 break-words text-muted-foreground">{s.text}</span>
                    {s.ms != null && <span className="shrink-0 tabular-nums text-muted-foreground">{s.ms} ms</span>}
                  </li>
                ))}
              </ol>
              <div className="mt-2 border-t pt-2 font-mono text-[11px] break-all text-muted-foreground">{tile.toolId}({JSON.stringify(tile.args)})</div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" />}>
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={refresh}><RefreshCw className={cn("size-4", refreshing && "animate-spin")} /> Refresh data</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onRemove}><X className="size-4" /> Remove</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="relative px-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={spec.id + tile.createdAt} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              {View ? <View frame={frame} /> : <div className="text-sm text-muted-foreground">No view for {spec.id}</div>}
            </motion.div>
          </AnimatePresence>
          {refreshing && <div className="absolute inset-0 animate-pulse bg-background/40" />}
        </div>

      </Card>
    </motion.div>
  );
}
