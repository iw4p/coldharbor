import { fieldsOf, type WidgetSpec } from "@glance/core";

export const stat: WidgetSpec = {
  id: "stat",
  name: "Number cards",
  ask: "Does the message ask for just one number?",
  score: (f) => (fieldsOf(f, "number").length && f.rows.length && f.rows.length <= 8 ? 0.55 + (f.rows.length === 1 ? 0.2 : 0) : 0),
};
