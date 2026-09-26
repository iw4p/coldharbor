import type { WidgetSpec } from "@coldharbor/core";

/** Records grouped by a status-like field: open/closed, todo/doing/done, passed/failed. */
export const kanban: WidgetSpec = {
  id: "kanban",
  name: "Board",
  ask: "Does the message ask for a board or to group items by status?",
  score: (f) => (f.groupField && f.rows.length >= 3 ? 0.6 : 0),
};
