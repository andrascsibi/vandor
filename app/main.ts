import "leaflet/dist/leaflet.css";
import "./style.css";
import * as L from "leaflet";
import graphUrl from "../data/segments.json?url";
import type { Edge, SegmentGraph } from "../graph/graph.ts";
import {
  pickRandomSegment,
  shareEndpoints,
  mapyRouteUrl,
  formatDistance,
  trailColour,
} from "./trip.ts";

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

  const latlngs = edge.coordinates.map(toLatLng);
  const colour = trailColour(edge.colours);
  // White casing under the coloured line so every waymark colour reads on topo.
  const casing = L.polyline(latlngs, { color: "#fff", weight: 8, opacity: 0.95 });
  const line = L.polyline(latlngs, { color: colour, weight: 4.5, opacity: 1 });
  const start = edge.coordinates[0];
  const end = edge.coordinates[edge.coordinates.length - 1];
  const dot = (p: [number, number]) =>
    L.circleMarker(toLatLng(p), {
      radius: 6,
      color: "#fff",
      weight: 2,
      fillColor: "#2b2620",
      fillOpacity: 1,
    });
  highlight = L.layerGroup([casing, line, dot(start), dot(end)]).addTo(map);
  map.fitBounds(line.getBounds(), { padding: [70, 70], maxZoom: 16 });

  const marks = edge.markings.length ? escapeHtml(edge.markings.join(" · ")) : "jelzett szakasz";
  const swatch = `<span class="swatch" style="background:${colour}"></span>`;
  const wayName = edge.name ? `<div class="wayname">${escapeHtml(edge.name)}</div>` : "";
  infoEl.innerHTML =
    `<div class="mark">${swatch}${marks}</div>` +
    `<div class="len">${formatDistance(edge.lengthM)}</div>` +
    wayName;

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
