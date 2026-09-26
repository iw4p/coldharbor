import type { WidgetSpec } from "@coldharbor/core";

/** Fallback for MCP tools that only return text. */
export const text: WidgetSpec = {
  id: "text",
  name: "Text",
  ask: "Does the message ask for plain text?",
  score: (f) => (f.fields.length === 1 && f.fields[0].name === "text" ? 0.95 : 0),
};
