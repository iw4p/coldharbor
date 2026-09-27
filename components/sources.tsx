"use client";

import { Blocks, Plug } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Catalog } from "@/core/server.ts";
import { views } from "@/widgets/views";

const Dot = ({ ok, warn }: { ok: boolean; warn?: boolean }) => <span className={cn("inline-block size-2 shrink-0 rounded-full", ok ? "bg-emerald-500" : warn ? "bg-amber-500" : "bg-rose-500")} />;

const SNIPPET = `"mcpServers": {
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "\${GITHUB_TOKEN}" }
  },
  "my-api": { "url": "https://example.com/mcp" }
}`;

/** Everything that's plugged in: MCP servers and their tools, widgets, router, LLM. */
export function Sources({ catalog, onOpen }: { catalog?: Catalog; onOpen(): void }) {
  const ready = catalog?.servers.filter((s) => s.state === "ready").length ?? 0;
  return (
    <Sheet onOpenChange={(o) => o && onOpen()}>
      <SheetTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full" />}>
        <Plug className="size-3.5" /> {ready} source{ready === 1 ? "" : "s"} · {catalog?.tools.length ?? 0} tools
      </SheetTrigger>
      <SheetContent className="w-[440px] overflow-y-auto sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle>Connected</SheetTitle>
          <SheetDescription>Sources are MCP servers. Widgets are React components. Neither knows about the other; they meet through Frames.</SheetDescription>
        </SheetHeader>
        {catalog && (
          <div className="space-y-6 px-4 pb-6 text-sm">
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Engine</h3>
              <div className="flex items-center gap-2"><Dot ok={catalog.router.up} /> Router: {catalog.router.name}</div>
              <div className="flex items-center gap-2"><Dot ok={catalog.llm.up} /> Details: {catalog.llm.name}</div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sources · MCP servers</h3>
              {catalog.servers.map((s) => (
                <div key={s.name} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 font-medium"><Dot ok={s.state === "ready"} warn={s.state === "needs-setup"} /> {s.name}
                    {s.state !== "ready" && <span className={cn("truncate text-xs font-normal", s.state === "needs-setup" ? "text-amber-600 dark:text-amber-400" : "text-destructive")}>{s.state === "needs-setup" ? "needs setup: " : ""}{s.error ?? s.state}</span>}
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {catalog.tools.filter((t) => t.server === s.name).map((t) => (
                      <li key={t.id}>
                        <div className="flex items-center gap-1.5 font-mono text-xs">{t.name}{!t.autoRun && <span className="rounded bg-amber-500/15 px-1 font-sans text-[10px] text-amber-700 dark:text-amber-300">asks first</span>}</div>
                        <div className="text-xs text-muted-foreground">{t.description}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Widgets</h3>
              <div className="grid grid-cols-2 gap-2">
                {catalog.widgets.map((w) => {
                  const Icon = views[w.id]?.icon ?? Blocks;
                  return (
                    <div key={w.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs">
                      <Icon className="size-4 text-muted-foreground" /> {w.name}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add a source</h3>
              <p className="text-xs text-muted-foreground">
                Add any MCP server to <code className="rounded bg-muted px-1">{catalog.configPath?.split("/").pop() ?? "coldharbor.config.json"}</code>, same format as Claude Desktop, then restart. Tools that return plain JSON or text work too; they become tables and text.
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed">{SNIPPET}</pre>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
