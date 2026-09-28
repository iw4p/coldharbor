/**
 * What each widget can draw, and the yes/no question System One answers about it. Plain data and pure
 * functions, so the server can use them without loading any UI code. The views are in views.tsx.
 */
import { hasField, labelField, measures, type Frame, type WidgetSpec } from "../core/frame.ts";

const isText = (f: Frame) => f.fields.length === 1 && f.fields[0].name === "text";
/** Workflow-like groupings (open/closed, todo/doing/done) make good boards; kinds and types make better tables. */
const WORKFLOW = /(^|\.)(state|status|stage|phase|conclusion)$/i;

export const specs: WidgetSpec[] = [
  {
    id: "line",
    name: "Line chart",
    ask: "Does the message ask for a line chart, graph, plot or trend?",
    // Rows that are named records (issues, repos: a labelField) are things that happen to have dates, not a time series.
    score: (f) => (!hasField(f, "time") || !measures(f).length || f.rows.length < 2 ? 0 : f.labelField ? 0.3 : 0.7 + (f.rows.length > 10 ? 0.1 : 0)),
  },
  {
    id: "bar",
    name: "Bar chart",
    ask: "Does the message ask for a bar chart?",
    score: (f) => (!measures(f).length || !f.rows.length || f.rows.length > 60 ? 0 : hasField(f, "time") ? 0.5 : labelField(f) ? 0.65 : 0),
  },
  {
    id: "stat",
    name: "Number cards",
    ask: "Does the message ask for just one number?",
    score: (f) => (measures(f).length && f.rows.length && f.rows.length <= 8 ? 0.55 + (f.rows.length === 1 ? 0.2 : 0) : 0),
  },
  {
    id: "map",
    name: "Map",
    ask: "Does the message ask to see it on a map?",
    score: (f) => (hasField(f, "lat") && hasField(f, "lon") && f.rows.length ? 0.85 : 0),
  },
  {
    id: "feed",
    name: "Headlines",
    ask: "Does the message ask for a list of headlines or articles?",
    score: (f) => (hasField(f, "url") && labelField(f) && f.rows.length ? 0.75 : 0),
  },
  {
    id: "kanban",
    name: "Board",
    ask: "Does the message ask for a board or to group items by status?",
    score: (f) => (!f.groupField || f.rows.length < 3 ? 0 : WORKFLOW.test(f.groupField) ? 0.6 : 0.3),
  },
  {
    id: "detail",
    name: "Details",
    ask: "Does the message ask to open the full details of one specific record, like an issue, a paper or a person?",
    score: (f) => (f.rows.length === 1 && f.fields.length >= 3 ? 0.8 : 0),
  },
  {
    id: "table",
    name: "Table",
    ask: "Does the message ask to see the data as a table?",
    score: (f) => (f.rows.length && !isText(f) ? 0.25 + Math.min(0.3, f.fields.length * 0.04) : 0),
  },
  {
    // Fallback for MCP tools that only return text.
    id: "text",
    name: "Text",
    ask: "Does the message ask for plain text?",
    score: (f) => (isText(f) ? 0.95 : 0),
  },
];
