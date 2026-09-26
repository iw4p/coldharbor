"use client";

import { useCallback, useEffect, useState } from "react";
import type { EngineEvent, Focus, Frame, Tile, TraceStep } from "@glance/core";

export type Message =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "run";
      message: string;
      status: "running" | "done" | "error" | "clarify" | "said";
      steps: TraceStep[];
      text?: string;
      clarify?: { question: string; options: { toolId: string; label: string; p: number }[] };
      tileId?: string;
    };

export interface Catalog {
  configPath?: string;
  servers: { name: string; state: string; error?: string; tools: string[] }[];
  tools: { id: string; server: string; name: string; title: string; description: string }[];
  widgets: { id: string; name: string; ask: string }[];
  router: { name: string; up: boolean };
  llm: { name: string; up: boolean };
}

const STORE = "glance:v1";
const uid = () => Math.random().toString(36).slice(2, 10);

/** All client state: tiles on the canvas, the chat, and which tile follow-ups refer to. */
export function useGlance() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  // Don't save until the saved state has been read (React runs effects twice in dev).
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
      if (saved) {
        setTiles(saved.tiles ?? []);
        setFocusId(saved.focusId ?? null);
        setMessages(saved.messages ?? []);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ tiles, focusId, messages: messages.slice(-40).filter((m) => m.role === "user" || m.status !== "running") }));
    } catch {}
  }, [hydrated, tiles, focusId, messages]);

  const loadCatalog = useCallback(async () => {
    try {
      setCatalog(await (await fetch("/api/catalog")).json());
    } catch {}
  }, []);
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const updateRun = (id: string, fn: (m: Extract<Message, { role: "run" }>) => Partial<Extract<Message, { role: "run" }>>) =>
    setMessages((ms) => ms.map((m) => (m.id === id && m.role === "run" ? { ...m, ...fn(m) } : m)));

  const ask = useCallback(async (message: string, forceTool?: string, replyTo?: string) => {
    const focusTile = tiles.find((t) => t.id === focusId);
    const focus: Focus | undefined = focusTile && { tileId: focusTile.id, toolId: focusTile.toolId, args: focusTile.args, widget: focusTile.widget, frames: focusTile.frames };
    const runId = replyTo ?? uid();
    if (replyTo) updateRun(runId, () => ({ status: "running", clarify: undefined }));
    else setMessages((ms) => [...ms, { id: uid(), role: "user", text: message }, { id: runId, role: "run", message, status: "running", steps: [] }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, focus, forceTool }) });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) handle(JSON.parse(line) as EngineEvent);
      }
    } catch (e) {
      updateRun(runId, () => ({ status: "error", text: (e as Error).message }));
    } finally {
      setBusy(false);
      updateRun(runId, (m) => (m.status === "running" ? { status: "done" } : {}));
    }

    function handle(e: EngineEvent) {
      if (e.type === "step") updateRun(runId, (m) => ({ steps: [...m.steps, e.step] }));
      else if (e.type === "say") updateRun(runId, () => ({ status: "said", text: e.text }));
      else if (e.type === "error") updateRun(runId, () => ({ status: "error", text: e.message }));
      else if (e.type === "clarify") updateRun(runId, () => ({ status: "clarify", clarify: { question: e.question, options: e.options } }));
      else if (e.type === "tile") {
        const tile = { ...e.tile, createdAt: Date.now() };
        setTiles((ts) => (e.replaces && ts.some((t) => t.id === e.replaces) ? ts.map((t) => (t.id === e.replaces ? tile : t)) : [tile, ...ts]));
        setFocusId(tile.id);
        updateRun(runId, () => ({ status: "done", tileId: tile.id }));
      }
    }
  }, [tiles, focusId]);

  const setWidget = (id: string, widget: string) => setTiles((ts) => ts.map((t) => (t.id === id ? { ...t, widget } : t)));
  const removeTile = (id: string) => {
    setTiles((ts) => ts.filter((t) => t.id !== id));
    setFocusId((f) => (f === id ? null : f));
  };
  const refreshTile = async (id: string) => {
    const t = tiles.find((x) => x.id === id);
    if (!t) return;
    const res = await fetch("/api/call", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ toolId: t.toolId, args: t.args }) });
    const j = (await res.json()) as { frames?: Frame[]; error?: string };
    if (!res.ok || !j.frames) throw new Error(j.error ?? "Refresh failed");
    setTiles((ts) => ts.map((x) => (x.id === id ? { ...x, frames: j.frames!, createdAt: Date.now() } : x)));
  };
  const clear = () => {
    setTiles([]);
    setMessages([]);
    setFocusId(null);
  };

  return { tiles, messages, focusId, setFocusId, busy, catalog, loadCatalog, ask, setWidget, removeTile, refreshTile, clear };
}
