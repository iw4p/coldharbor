"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, CircleMarker, useMap } from "react-leaflet";
import { useTheme } from "@/lib/theme";
import { fieldsOf, labelField, type Frame } from "@coldharbor/core";
import { fmtNumber } from "../format.ts";

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 7);
    else if (points.length) map.fitBounds(points, { padding: [36, 36], maxZoom: 6 });
    setTimeout(() => map.invalidateSize(), 60);
  }, [map, points]);
  return null;
}

/** Labelled pins for a few places, bubbles sized by value for many. */
export default function MapView({ frame }: { frame: Frame }) {
  const { resolvedTheme } = useTheme();
  const lat = frame.fields.find((f) => f.type === "lat")!.name;
  const lon = frame.fields.find((f) => f.type === "lon")!.name;
  const value = fieldsOf(frame, "number")[0];
  const label = labelField(frame);
  const rows = frame.rows.filter((r) => typeof r[lat] === "number" && typeof r[lon] === "number");
  const points = rows.map((r) => [r[lat], r[lon]] as [number, number]);
  const max = Math.max(1, ...rows.map((r) => Math.abs(Number(value ? r[value.name] : 1)) || 0));
  const pins = rows.length <= 12;
  const tiles = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${resolvedTheme === "dark" ? "Dark" : "Light"}_Gray_Base/MapServer/tile/{z}/{y}/{x}`;

  return (
    <MapContainer center={[20, 0]} zoom={2} scrollWheelZoom={false} worldCopyJump className="h-[260px] w-full overflow-hidden rounded-lg border" style={{ zIndex: 0 }}>
      <TileLayer key={tiles} url={tiles} attribution="Tiles © Esri — Esri, HERE, Garmin, OpenStreetMap contributors" maxZoom={16} />
      <Fit points={points} />
      {rows.map((r, i) => {
        const name = label ? String(r[label.name]) : "";
        const v = value ? r[value.name] : null;
        const popup = (
          <Popup>
            <b>{name}</b>
            {frame.fields.filter((f) => f.type === "number").map((f) => <div key={f.name}>{f.label ?? f.name}: {fmtNumber(r[f.name])} {f.unit}</div>)}
          </Popup>
        );
        return pins ? (
          <Marker key={i} position={points[i]} icon={L.divIcon({
            className: "",
            iconSize: [0, 0],
            html: `<div class="coldharbor-pin"><b>${fmtNumber(v)}${value?.unit ?? ""}</b> ${name.replace(/</g, "&lt;")}</div>`,
          })}>{popup}</Marker>
        ) : (
          <CircleMarker key={i} center={points[i]} radius={5 + 20 * Math.sqrt(Math.abs(Number(v) || 0) / max)}
            pathOptions={{ color: "var(--chart-1)", fillColor: "var(--chart-1)", fillOpacity: 0.45, weight: 1.5 }}>{popup}</CircleMarker>
        );
      })}
    </MapContainer>
  );
}
