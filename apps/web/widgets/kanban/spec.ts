import type { WidgetSpec } from "@coldharbor/core";

/** Workflow-like groupings (open/closed, todo/doing/done) make good boards; kinds and types make better tables. */
const WORKFLOW = /(^|\.)(state|status|stage|phase|conclusion)$/i;

/** Records grouped by a status-like field: open/closed, todo/doing/done, passed/failed. */
export const kanban: WidgetSpec = {
  id: "kanban",
  name: "Board",
  ask: "Does the message ask for a board or to group items by status?",
  score: (f) => (!f.groupField || f.rows.length < 3 ? 0 : WORKFLOW.test(f.groupField) ? 0.6 : 0.3),
};
