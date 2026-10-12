import "leaflet/dist/leaflet.css";
import "./style.css";
import * as L from "leaflet";
import graphUrl from "../data/segments.json?url";
import type { Edge, SegmentGraph, Vertex } from "../graph/graph.ts";
import {
  pickRandomSegment,
  shareEndpoints,
  mapyRouteUrl,
  formatDistance,
  trailColour,
  poiLabel,
  endpointsText,
  accessSummary,
  segmentsInBounds,
  type GeoBounds,
} from "./trip.ts";

const BUDA_HILLS_CENTER: L.LatLngTuple = [47.54, 18.97];

const map = L.map("map", { zoomControl: true }).setView(BUDA_HILLS_CENTER, 13);
L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  maxZoom: 17,
  attribution:
    'Térkép: © <a href="https://opentopomap.org/">OpenTopoMap</a> (CC-BY-SA) · ' +
    'adatok © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// Base layer: every in-viewport segment, drawn thin on a canvas pane *below* the
// selected-segment highlight so the pick still pops. Canvas handles ~1000 lines
// and gives cheap click hit-testing with a little tolerance for thin lines.
map.createPane("network");
map.getPane("network")!.style.zIndex = "350";
const netRenderer = L.canvas({ pane: "network", padding: 0.5, tolerance: 6 });

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

const BASE_WEIGHT = 3.5;
const BASE_OPACITY = 0.85;

let highlight: L.LayerGroup | null = null;
let network: L.LayerGroup | null = null;
let selectedId = -1;
let graphRef: SegmentGraph | null = null;

// Redraw the base network for the current viewport, skipping the selected
// segment (it lives in the highlight layer, drawn on top).
function drawNetwork(graph: SegmentGraph): void {
  map.getContainer().style.cursor = ""; // a redraw may drop a hovered line
  const b = map.getBounds();
  const bounds: GeoBounds = {
    west: b.getWest(),
    south: b.getSouth(),
    east: b.getEast(),
    north: b.getNorth(),
  };
  const visible = segmentsInBounds(graph.edges, bounds);
  const lines = visible
    .filter((edge) => edge.id !== selectedId)
    .map((edge) => {
      const pl = L.polyline(edge.coordinates.map(toLatLng), {
        renderer: netRenderer,
        pane: "network",
        color: trailColour(edge.colours),
        weight: BASE_WEIGHT,
        opacity: BASE_OPACITY,
      });
      pl.on("click", () => selectSegment(edge, graph.vertices, false));
      pl.on("mouseover", () => {
        pl.setStyle({ weight: 6, opacity: 1 });
        map.getContainer().style.cursor = "pointer";
      });
      pl.on("mouseout", () => {
        pl.setStyle({ weight: BASE_WEIGHT, opacity: BASE_OPACITY });
        map.getContainer().style.cursor = "";
      });
      return pl;
    });
  network?.remove();
  network = L.layerGroup(lines).addTo(map);
}

// Select a segment: draw its highlight + fill the panel. `fit` zooms to it (the
// random roll); a map click selects in place (fit = false).
function selectSegment(edge: Edge, vertices: Vertex[], fit: boolean): void {
  highlight?.remove();
  selectedId = edge.id;

  const latlngs = edge.coordinates.map(toLatLng);
  const colour = trailColour(edge.colours);
  // White casing under the coloured line so every waymark colour reads on topo.
  // interactive: false — let clicks fall through to the base network beneath.
  const casing = L.polyline(latlngs, { color: "#fff", weight: 8, opacity: 0.95, interactive: false });
  const line = L.polyline(latlngs, { color: colour, weight: 4.5, opacity: 1, interactive: false });
  const fromV = vertices[edge.from];
  const toV = vertices[edge.to];
  const start = edge.coordinates[0];
  const end = edge.coordinates[edge.coordinates.length - 1];
  const dot = (p: [number, number], v: Vertex) => {
    const m = L.circleMarker(toLatLng(p), {
      radius: 6,
      color: "#fff",
      weight: 2,
      fillColor: "#2b2620",
      fillOpacity: 1,
    });
    const label = poiLabel(v);
    if (label) m.bindTooltip(label, { direction: "top", offset: [0, -6] });
    return m;
  };

  // Nearest car access (T6): a dashed crow-flies line from each end to its
  // parking, and a 🅿️ marker (deduped when both ends share one lot). The gap is
  // the turista's to bridge — we only point at the car.
  const accessLayers: L.Layer[] = [];
  const drawnAccess = new Set<string>();
  for (const v of [fromV, toV]) {
    const a = v.access;
    if (!a) continue;
    const accLL = toLatLng([a.lon, a.lat]);
    accessLayers.push(
      L.polyline([toLatLng([v.lon, v.lat]), accLL], {
        color: "#333",
        weight: 2,
        opacity: 0.85,
        dashArray: "2 7",
        interactive: false,
      }),
    );
    const key = `${a.lon},${a.lat}`;
    if (!drawnAccess.has(key)) {
      drawnAccess.add(key);
      const m = L.marker(accLL, {
        icon: L.divIcon({ className: "pmark-wrap", html: '<div class="pmark">P</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      });
      const name = a.name ? escapeHtml(a.name) : "parkoló";
      m.bindTooltip(`🅿️ ${name} · ${formatDistance(a.distM)}`, { direction: "top", offset: [0, -10] });
      accessLayers.push(m);
    }
  }

  highlight = L.layerGroup([casing, line, ...accessLayers, dot(start, fromV), dot(end, toV)]).addTo(map);
  if (fit) {
    // Frame the segment plus its access points so you can see where to park.
    const bounds = L.latLngBounds(latlngs);
    for (const v of [fromV, toV]) if (v.access) bounds.extend(toLatLng([v.access.lon, v.access.lat]));
    map.fitBounds(bounds, { padding: [70, 70], maxZoom: 16 });
  }

  const marks = edge.markings.length ? escapeHtml(edge.markings.join(" · ")) : "jelzett szakasz";
  const swatch = `<span class="swatch" style="background:${colour}"></span>`;
  const ends = endpointsText(fromV, toV);
  const endsLine = ends ? `<div class="ends">${escapeHtml(ends)}</div>` : "";
  const access = accessSummary(fromV.access, toV.access);
  const accessLine = access ? `<div class="access">${escapeHtml(access)}</div>` : "";
  const wayName = edge.name ? `<div class="wayname">${escapeHtml(edge.name)}</div>` : "";
  infoEl.innerHTML =
    `<div class="mark">${swatch}${marks}</div>` +
    endsLine +
    `<div class="len">${formatDistance(edge.lengthM)}</div>` +
    accessLine +
    wayName;

  const [from, to] = shareEndpoints(edge);
  mapyEl.href = mapyRouteUrl(from, to);
  mapyEl.removeAttribute("aria-disabled");

  // Refresh the base so the newly selected segment drops out of it and any
  // previously selected one returns. (fitBounds will also redraw via moveend.)
  if (graphRef) drawNetwork(graphRef);
}

async function init(): Promise<void> {
  const graph = (await fetch(graphUrl).then((r) => r.json())) as SegmentGraph;
  graphRef = graph;
  const roll = () => selectSegment(pickRandomSegment(graph.edges), graph.vertices, true);
  rollBtn.addEventListener("click", roll);
  // Keep the base network in sync with the viewport on pan/zoom.
  map.on("moveend", () => drawNetwork(graph));
  roll(); // land on a random segment immediately (also draws the network)
}

void init();
