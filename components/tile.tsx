"use client";

import { AnimatePresence, motion } from "motion/react";
import { MoreHorizontal, RefreshCw, Sparkles, X } from "lucide-react";
import { cn } from "cn";
import type { Intent } from "@/core/canvas.ts";
import { frameFor, rankWidgets } from "@/core/frame.ts";
import type { Tile } from "@/core/types.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { specs } from "@/widgets/specs.ts";
import { views } from "@/widgets/views";
import { Trace } from "./chat";

export function TileCard({ tile, focused, onFocus, send }: { tile: Tile; focused: boolean; onFocus(): void; send(intent: Intent): void }) {
  const spec = specs.find((s) => s.id === tile.widget) ?? specs[0];
  const frame = frameFor(spec, tile.frames) ?? tile.frames[0];
  const fits = rankWidgets(specs, tile.frames);
  const View = views[spec.id]?.View;
  const [server, tool] = [tile.toolId.slice(0, tile.toolId.indexOf(".")), tile.toolId.slice(tile.toolId.indexOf(".") + 1)];

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
                    onClick={() => send({ tile: tile.id, widget: id })}
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
              <Trace steps={tile.trace} />
              <div className="mt-2 border-t pt-2 font-mono text-[11px] break-all text-muted-foreground">{tile.toolId}({JSON.stringify(tile.args)})</div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" />}>
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => send({ refresh: tile.id })}><RefreshCw className="size-4" /> Refresh data</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => send({ remove: tile.id })}><X className="size-4" /> Remove</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="px-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={spec.id + tile.createdAt} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              {View ? <View frame={frame} /> : <div className="text-sm text-muted-foreground">No view for {spec.id}</div>}
            </motion.div>
          </AnimatePresence>
        </div>

      </Card>
    </motion.div>
  );
}
