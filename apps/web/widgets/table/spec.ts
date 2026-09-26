import type { WidgetSpec } from "@glance/core";

export const table: WidgetSpec = {
  id: "table",
  name: "Table",
  ask: "Does the message ask to see the data as a table?",
  score: (f) => (f.rows.length && !(f.fields.length === 1 && f.fields[0].name === "text") ? 0.25 + Math.min(0.3, f.fields.length * 0.04) : 0),
};
