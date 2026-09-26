/**
 * Widget specs: what each widget can draw, and the yes/no question the router asks about it.
 * Pure data + functions, so the server can use them without loading any UI code.
 *
 * To add a widget: create widgets/<id>/spec.ts + view.tsx, then add it here and in views.tsx.
 */
import type { WidgetSpec } from "@coldharbor/core";
import { bar } from "./bar/spec.ts";
import { feed } from "./feed/spec.ts";
import { line } from "./line/spec.ts";
import { map } from "./map/spec.ts";
import { stat } from "./stat/spec.ts";
import { table } from "./table/spec.ts";
import { text } from "./text/spec.ts";

export const specs: WidgetSpec[] = [line, bar, stat, map, feed, table, text];
