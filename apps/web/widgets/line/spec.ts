import { fieldsOf, hasField, type WidgetSpec } from "@coldharbor/core";

export const line: WidgetSpec = {
  id: "line",
  name: "Line chart",
  ask: "Does the message ask for a line chart, graph, plot or trend?",
  score: (f) => (hasField(f, "time") && fieldsOf(f, "number").length && f.rows.length >= 2 ? 0.7 + (f.rows.length > 10 ? 0.1 : 0) : 0),
};
