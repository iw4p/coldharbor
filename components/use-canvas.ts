"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apply, type Canvas, type Edit, type Intent } from "@/core/canvas.ts";
import type { Catalog } from "@/core/server.ts";

/** The canvas lives on the server. This mirrors it, sends the user's intents, and applies the edits that come back. */
export function useCanvas() {
  const [canvas, setCanvas] = useState<Canvas>({ runs: [], tiles: [] });
  const [focus, setFocus] = useState<string>();
  /** The run being worked on, while a request is in flight. */
  const [active, setActive] = useState<string>();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [catalog, setCatalog] = useState<Catalog>();
  const loadCatalog = () => fetch("/api?catalog").then((r) => r.json()).then(setCatalog, () => {});

  useEffect(() => {
    fetch("/api").then((r) => r.json()).then((c: Canvas) => {
      setCanvas(c);
      setFocus(c.tiles[0]?.id);
    });
    loadCatalog();
  }, []);

  async function send(intent: Intent) {
    // Layout changes (a view, removing a tile, clearing) apply any time; anything that runs goes one at a time.
    const runs = !("tile" in intent || "remove" in intent || "clear" in intent);
    if (runs && running.current) return;
    if (runs) {
      running.current = true;
      setBusy(true);
      setActive("run" in intent ? intent.run : undefined);
    }
    try {
      const res = await fetch("/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(intent) });
      if (!res.ok || !res.body) throw new Error(await res.text());
      for await (const e of lines<Edit>(res.body)) {
        setCanvas((c) => apply(c, e));
        if ("message" in e) setActive(e.run);
        if ("event" in e && e.event.type === "tile") setFocus(e.event.tile.id);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (runs) {
        running.current = false;
        setBusy(false);
        setActive(undefined);
      }
    }
  }

  return { canvas, focus, setFocus, active, busy, send, catalog, loadCatalog };
}

/** Newline-delimited JSON, one value per line, as it streams in. */
async function* lines<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    const parts = (buf + decoder.decode(value, { stream: true })).split("\n");
    buf = parts.pop()!;
    for (const p of parts) if (p) yield JSON.parse(p) as T;
  }
}
