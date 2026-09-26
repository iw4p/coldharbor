"use client";

/**
 * Widget components, by spec id. Each gets the frame that its spec scored highest.
 * To add a widget: create widgets/<id>/spec.ts + view.tsx, then register it here and in specs.ts.
 */
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { Frame } from "@glance/core";
import { BarChart3, FileText, LineChart, List, Map, SquareStack, Table2, type LucideIcon } from "lucide-react";
import BarView from "./bar/view";
import FeedView from "./feed/view";
import LineView from "./line/view";
import StatView from "./stat/view";
import TableView from "./table/view";
import TextView from "./text/view";

// Leaflet needs `window`, so the map loads in the browser only.
const MapView = dynamic(() => import("./map/view"), { ssr: false, loading: () => <div className="h-[260px] animate-pulse rounded-lg bg-muted" /> });

export const views: Record<string, { icon: LucideIcon; View: ComponentType<{ frame: Frame }> }> = {
  line: { icon: LineChart, View: LineView },
  bar: { icon: BarChart3, View: BarView },
  stat: { icon: SquareStack, View: StatView },
  map: { icon: Map, View: MapView },
  feed: { icon: List, View: FeedView },
  table: { icon: Table2, View: TableView },
  text: { icon: FileText, View: TextView },
};
