import "leaflet/dist/leaflet.css";
import "./style.css";
import * as L from "leaflet";
import graphUrl from "../data/segments.json?url";
import type { Edge, SegmentGraph, Vertex } from "../graph/graph.ts";
import {
  pickRandomSegment,
  formatDistance,
  trailColour,
  poiLabel,
  endpointsText,
  mapyTripUrl,
  segmentsInBounds,
  type GeoBounds,
} from "./trip.ts";
import { toggleSegment, totalLengthM, orderedWaypoints } from "./tour.ts";

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

// A túra (T7) is an ordered list of edge ids the user assembles by clicking.
let network: L.LayerGroup | null = null; // base (non-túra) segments, canvas pane
let tourLayer: L.LayerGroup | null = null; // the túra's highlighted segments + dots
let tour: number[] = [];
let graphRef: SegmentGraph | null = null;
const edgesById = new Map<number, Edge>();
const vById = new Map<number, Vertex>();

const latLngsOf = (edge: Edge) => edge.coordinates.map(toLatLng);

// Toggle a segment in/out of the túra, then redraw everything.
function toggleInTour(id: number): void {
  tour = toggleSegment(tour, id);
  rebuild();
}

// Base network: in-viewport segments NOT in the túra, thin + clickable to add.
function drawNetwork(): void {
  if (!graphRef) return;
  map.getContainer().style.cursor = ""; // a redraw may drop a hovered line
  const b = map.getBounds();
  const bounds: GeoBounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
  const inTour = new Set(tour);
  const visible = segmentsInBounds(graphRef.edges, bounds).filter((e) => !inTour.has(e.id));
  const lines = visible.map((edge) => {
    const pl = L.polyline(latLngsOf(edge), {
      renderer: netRenderer,
      pane: "network",
      color: trailColour(edge.colours),
      weight: BASE_WEIGHT,
      opacity: BASE_OPACITY,
    });
    pl.on("click", () => toggleInTour(edge.id));
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

// The túra: each member segment highlighted (white casing + colour), click to
// remove; a dot at every distinct endpoint, named ones carrying a tooltip.
function drawTour(): void {
  tourLayer?.remove();
  const layers: L.Layer[] = [];
  const dotSeen = new Set<number>();
  for (const id of tour) {
    const edge = edgesById.get(id);
    if (!edge) continue;
    const latlngs = latLngsOf(edge);
    layers.push(L.polyline(latlngs, { color: "#fff", weight: 8, opacity: 0.95, interactive: false }));
    const line = L.polyline(latlngs, { color: trailColour(edge.colours), weight: 4.5, opacity: 1 });
    line.on("click", () => toggleInTour(id));
    line.on("mouseover", () => { map.getContainer().style.cursor = "pointer"; });
    line.on("mouseout", () => { map.getContainer().style.cursor = ""; });
    layers.push(line);
    for (const vid of [edge.from, edge.to]) {
      if (dotSeen.has(vid)) continue;
      dotSeen.add(vid);
      const vx = vById.get(vid);
      if (!vx) continue;
      const m = L.circleMarker(toLatLng([vx.lon, vx.lat]), {
        radius: 6,
        color: "#fff",
        weight: 2,
        fillColor: "#2b2620",
        fillOpacity: 1,
      });
      const label = poiLabel(vx);
      if (label) m.bindTooltip(label, { direction: "top", offset: [0, -6] });
      layers.push(m);
    }
  }
  tourLayer = L.layerGroup(layers).addTo(map);
}

function renderPanel(): void {
  if (tour.length === 0) {
    infoEl.innerHTML =
      `<div class="hint">Dobj egyet, vagy kattints a térképen egy szakaszra — így építed fel a túrát.</div>`;
    return;
  }
  const total = totalLengthM(tour, edgesById);
  const rows = tour
    .map((id) => {
      const e = edgesById.get(id);
      if (!e) return "";
      const swatch = `<span class="swatch" style="background:${trailColour(e.colours)}"></span>`;
      const marks = e.markings.length ? escapeHtml(e.markings.join(" · ")) : "jelzett szakasz";
      const ends = endpointsText(vById.get(e.from) ?? {}, vById.get(e.to) ?? {});
      const endsLabel = ends ? `<span class="seg-ends">${escapeHtml(ends)}</span>` : "";
      return (
        `<li class="seg-row"><span class="seg-main">${swatch}${marks}${endsLabel}</span>` +
        `<span class="seg-len">${formatDistance(e.lengthM)}</span>` +
        `<button class="seg-remove" type="button" data-id="${id}" title="Töröld a szakaszt">✕</button></li>`
      );
    })
    .join("");
  infoEl.innerHTML =
    `<div class="tour-head"><strong>Túra</strong> · ${tour.length} szakasz · <span class="tour-total">${formatDistance(total)}</span></div>` +
    `<ul class="seg-list">${rows}</ul>` +
    `<button class="clear" type="button">Ürítsd a túrát</button>`;
}

function updateMapy(): void {
  const url = mapyTripUrl(orderedWaypoints(tour, edgesById, vById));
  if (url) {
    mapyEl.href = url;
    mapyEl.removeAttribute("aria-disabled");
  } else {
    mapyEl.removeAttribute("href");
    mapyEl.setAttribute("aria-disabled", "true");
  }
}

function rebuild(): void {
  drawTour();
  drawNetwork();
  renderPanel();
  updateMapy();
}

// Panel interactions: remove one segment, or clear the whole túra.
infoEl.addEventListener("click", (ev) => {
  const target = ev.target as HTMLElement;
  const remove = target.closest(".seg-remove") as HTMLElement | null;
  if (remove) {
    toggleInTour(Number(remove.dataset.id));
    return;
  }
  if (target.closest(".clear")) {
    tour = [];
    rebuild();
  }
});

async function init(): Promise<void> {
  const graph = (await fetch(graphUrl).then((r) => r.json())) as SegmentGraph;
  graphRef = graph;
  for (const e of graph.edges) edgesById.set(e.id, e);
  for (const v of graph.vertices) vById.set(v.id, v);

  // "Vándor dob" starts a fresh túra from a random seed segment.
  const roll = () => {
    const seed = pickRandomSegment(graph.edges);
    tour = [seed.id];
    map.fitBounds(L.latLngBounds(latLngsOf(seed)), { padding: [70, 70], maxZoom: 16 });
    rebuild();
  };
  rollBtn.addEventListener("click", roll);
  map.on("moveend", drawNetwork); // keep the base network in sync on pan/zoom
  roll();
}

void init();
