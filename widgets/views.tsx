"use client";

/**
 * Widget components, by spec id. Each gets the frame that its spec scored highest.
 * To add a widget: write widgets/<id>.tsx, then add it here and its spec to specs.ts.
 */
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { Frame } from "@/core/frame.ts";
import { BarChart3, FileText, Columns3, IdCard, LineChart, List, Map, SquareStack, Table2, type LucideIcon } from "lucide-react";
import BarView from "./bar";
import DetailView from "./detail";
import KanbanView from "./kanban";
import FeedView from "./feed";
import LineView from "./line";
import StatView from "./stat";
import TableView from "./table";
import TextView from "./text";

// Leaflet needs `window`, so the map loads in the browser only.
const MapView = dynamic(() => import("./map"), { ssr: false, loading: () => <div className="h-[260px] animate-pulse rounded-lg bg-muted" /> });

export const views: Record<string, { icon: LucideIcon; View: ComponentType<{ frame: Frame }> }> = {
  line: { icon: LineChart, View: LineView },
  bar: { icon: BarChart3, View: BarView },
  stat: { icon: SquareStack, View: StatView },
  map: { icon: Map, View: MapView },
  feed: { icon: List, View: FeedView },
  kanban: { icon: Columns3, View: KanbanView },
  detail: { icon: IdCard, View: DetailView },
  table: { icon: Table2, View: TableView },
  text: { icon: FileText, View: TextView },
};
