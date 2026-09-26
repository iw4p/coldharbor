import { fieldsOf, hasField, labelField, type WidgetSpec } from "@coldharbor/core";

export const bar: WidgetSpec = {
  id: "bar",
  name: "Bar chart",
  ask: "Does the message ask for a bar chart?",
  score: (f) => {
    if (!fieldsOf(f, "number").length || !f.rows.length || f.rows.length > 60) return 0;
    if (hasField(f, "time")) return 0.5;
    return labelField(f) ? 0.65 : 0;
  },
};
