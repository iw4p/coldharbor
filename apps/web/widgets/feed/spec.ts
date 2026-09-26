import { hasField, labelField, type WidgetSpec } from "@coldharbor/core";

export const feed: WidgetSpec = {
  id: "feed",
  name: "Headlines",
  ask: "Does the message ask for a list of headlines or articles?",
  score: (f) => (hasField(f, "url") && labelField(f) && f.rows.length ? 0.75 : 0),
};
