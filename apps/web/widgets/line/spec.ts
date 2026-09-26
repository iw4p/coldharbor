import { hasField, measures, type WidgetSpec } from "@coldharbor/core";

/**
 * Trends over time. A frame whose rows are named records (issues, repos, orders: it has a labelField)
 * is a list of things that happen to have dates, not a time series, so it scores low there.
 */
export const line: WidgetSpec = {
  id: "line",
  name: "Line chart",
  ask: "Does the message ask for a line chart, graph, plot or trend?",
  score: (f) => {
    if (!hasField(f, "time") || !measures(f).length || f.rows.length < 2) return 0;
    if (f.labelField) return 0.3;
    return 0.7 + (f.rows.length > 10 ? 0.1 : 0);
  },
};
