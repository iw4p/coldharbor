import type { WidgetSpec } from "@coldharbor/core";

/** One record: an issue, a user, a repository, an order. */
export const detail: WidgetSpec = {
  id: "detail",
  name: "Details",
  ask: "Does the message ask for the details of one specific item?",
  score: (f) => (f.rows.length === 1 && f.fields.length >= 3 ? 0.8 : 0),
};
