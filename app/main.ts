import "leaflet/dist/leaflet.css";
import "./style.css";
import * as L from "leaflet";
import graphUrl from "../data/segments.json?url";
import type { Edge, SegmentGraph } from "../graph/graph.ts";
import { pickRandomSegment, shareEndpoints, mapyRouteUrl, formatDistance } from "./trip.ts";

const BUDA_HILLS_CENTER: L.LatLngTuple = [47.54, 18.97];

const map = L.map("map", { zoomControl: true }).setView(BUDA_HILLS_CENTER, 13);
L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  maxZoom: 17,
  attribution:
    'Térkép: © <a href="https://opentopomap.org/">OpenTopoMap</a> (CC-BY-SA) · ' +
    'adatok © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const rollBtn = document.getElementById("roll") as HTMLButtonElement;
const infoEl = document.getElementById("info") as HTMLDivElement;
const mapyEl = document.getElementById("mapy") as HTMLAnchorElement;

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

// [lon, lat] (GeoJSON) → [lat, lon] (Leaflet).
const toLatLng = ([lon, lat]: [number, number]): L.LatLngTuple => [lat, lon];

let highlight: L.LayerGroup | null = null;

function showSegment(edge: Edge): void {
  highlight?.remove();

  const line = L.polyline(edge.coordinates.map(toLatLng), {
    color: "#e8590c",
    weight: 5,
    opacity: 0.9,
  });
  const start = edge.coordinates[0];
  const end = edge.coordinates[edge.coordinates.length - 1];
  const dot = (p: [number, number], fill: string) =>
    L.circleMarker(toLatLng(p), {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: fill,
      fillOpacity: 1,
    });
  highlight = L.layerGroup([line, dot(start, "#2b8a3e"), dot(end, "#c92a2a")]).addTo(map);
  map.fitBounds(line.getBounds(), { padding: [70, 70], maxZoom: 16 });

  const name = edge.name ? escapeHtml(edge.name) : "névtelen szakasz";
  infoEl.innerHTML = `<div class="name">${name}</div><div class="len">${formatDistance(edge.lengthM)}</div>`;

  const [from, to] = shareEndpoints(edge);
  mapyEl.href = mapyRouteUrl(from, to);
  mapyEl.removeAttribute("aria-disabled");
}

async function init(): Promise<void> {
  const graph = (await fetch(graphUrl).then((r) => r.json())) as SegmentGraph;
  const roll = () => showSegment(pickRandomSegment(graph.edges));
  rollBtn.addEventListener("click", roll);
  roll(); // land on a random segment immediately
}

void init();
