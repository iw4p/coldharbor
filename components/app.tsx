"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Moon, Sun, Trash2 } from "lucide-react";
import { useTheme } from "@/lib/theme";
import type { Catalog } from "@/core/server.ts";
import { Button } from "@/components/ui/button";
import { Chat } from "./chat";
import { Sources } from "./sources";
import { TileCard } from "./tile";
import { useCanvas } from "./use-canvas";

export function ColdHarborApp() {
  const g = useCanvas();
  const { resolvedTheme, setTheme } = useTheme();
  const { runs, tiles } = g.canvas;
  const focus = tiles.find((t) => t.id === g.focus);

  const showTile = (id: string) => {
    g.setFocus(id);
    document.getElementById(`tile-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="grid h-dvh grid-cols-1 max-md:grid-rows-[1fr_45dvh] md:grid-cols-[1fr_400px]">
      <main className="coldharbor-canvas min-h-0 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/70 px-5 py-2.5 backdrop-blur">
          <Logo />
          <span className="whitespace-nowrap font-semibold tracking-tight">ColdHarbor</span>
          {tiles.length > 0 && <span className="whitespace-nowrap text-sm text-muted-foreground">· {tiles.length} tile{tiles.length === 1 ? "" : "s"}</span>}
          <div className="ml-auto flex items-center gap-2">
            <Health ok={g.catalog?.router.up} label={g.catalog?.router.name ?? "router"} />
            <Health ok={g.catalog?.llm.up} label={g.catalog?.llm.name.split(" ")[0] ?? "llm"} />
            <Sources catalog={g.catalog} onOpen={g.loadCatalog} />
            <Button variant="ghost" size="icon" className="size-8" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              <Sun className="hidden size-4 dark:block" />
              <Moon className="size-4 dark:hidden" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Clear canvas" onClick={() => g.send({ clear: true })}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        {!tiles.length ? (
          <Empty catalog={g.catalog} onAsk={(t) => g.send({ ask: t })} />
        ) : (
          <LayoutGroup>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,420px),1fr))] gap-4 p-5">
              <AnimatePresence mode="popLayout">
                {tiles.map((t) => (
                  <div key={t.id} id={`tile-${t.id}`}>
                    <TileCard tile={t} focused={t.id === g.focus} onFocus={() => g.setFocus(t.id)} send={g.send} />
                  </div>
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        )}
      </main>

      <aside className="flex min-h-0 flex-col border-l bg-card/60 max-md:border-t max-md:border-l-0">
        <Chat runs={runs} busy={g.busy} active={g.active} focus={focus} send={g.send} onClearFocus={() => g.setFocus(undefined)} onShowTile={showTile} />
      </aside>
    </div>
  );
}

function Health({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <span className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground lg:flex">
      <span className={ok === undefined ? "size-1.5 rounded-full bg-muted-foreground/40" : ok ? "size-1.5 rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-rose-500"} />
      {label}
    </span>
  );
}

function Logo() {
  return (
    <motion.div initial={{ rotate: -20, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} className="grid size-6 grid-cols-2 gap-0.5">
      {[1, 2, 3, 4].map((i) => <span key={i} className="rounded-[3px]" style={{ background: `var(--chart-${i})` }} />)}
    </motion.div>
  );
}

function Empty({ catalog, onAsk }: { catalog?: Catalog; onAsk(t: string): void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-6 pt-[12vh] text-center">
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-semibold tracking-tight">
        Ask. Watch it appear.
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="mt-3 text-muted-foreground">
        ColdHarbor connects to MCP servers, understands what you want, and draws it with the right widget.
        Follow up with &ldquo;as a table&rdquo; or &ldquo;what about Tehran?&rdquo;.
      </motion.p>
      <div className="mt-8 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {(catalog?.tools ?? []).map((t, i) => (
          <motion.button key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.05 }}
            onClick={() => onAsk(t.description.match(/"([^"]+)"/)?.[1] ?? t.title)}
            className="rounded-xl border bg-card/70 p-3 text-left backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="text-sm font-medium">{t.title}</div>
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</div>
            <div className="mt-2 font-mono text-[10.5px] text-muted-foreground/70">{t.id}</div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
