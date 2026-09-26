import { measures, type WidgetSpec } from "@coldharbor/core";

export const stat: WidgetSpec = {
  id: "stat",
  name: "Number cards",
  ask: "Does the message ask for just one number?",
  score: (f) => (measures(f).length && f.rows.length && f.rows.length <= 8 ? 0.55 + (f.rows.length === 1 ? 0.2 : 0) : 0),
};
