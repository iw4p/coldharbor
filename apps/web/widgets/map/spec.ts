import { hasField, type WidgetSpec } from "@glance/core";

export const map: WidgetSpec = {
  id: "map",
  name: "Map",
  ask: "Does the message ask to see it on a map?",
  score: (f) => (hasField(f, "lat") && hasField(f, "lon") && f.rows.length ? 0.85 : 0),
};
