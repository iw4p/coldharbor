"use client";

import type { Frame } from "@coldharbor/core";

export default function TextView({ frame }: { frame: Frame }) {
  return <div className="max-h-[260px] overflow-auto whitespace-pre-wrap text-sm leading-relaxed">{String(frame.rows[0]?.text ?? "")}</div>;
}
