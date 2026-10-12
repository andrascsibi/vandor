import "leaflet/dist/leaflet.css";
import "./style.css";
import * as L from "leaflet";
import graphUrl from "../data/segments.json?url";
import type { Edge, SegmentGraph, Vertex } from "../graph/graph.ts";
import { haversine } from "../graph/graph.ts";
import { SZELL_KALMAN_TER, RANGE_RADIUS_M } from "../ingest/overpass.ts";
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
import {
  toggleSegment,
  totalLengthM,
  tourWalkingLengthM,
  isRetraceSpur,
  orderedWaypoints,
  orderedSegments,
  tourAccessPoints,
  encodeTourHash,
  parseTourHash,
  type AccessCandidate,
} from "./tour.ts";
import {
  buildRouteGraph,
  deadEndVertices,
  tourComponents,
  tourOpenEnds,
  fillTourGaps,
  closeTourLoop,
  type RouteGraph,
} from "./router.ts";

// Crow-flies km from the chosen parking back to the hardcoded start.
const SZELL: [number, number] = [SZELL_KALMAN_TER[0], SZELL_KALMAN_TER[1]];

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
const gmapsEl = document.getElementById("gmaps") as HTMLAnchorElement;

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
let emphasisLayer: L.LayerGroup | null = null; // the one segment hovered/tapped in the panel
let accessLayer: L.LayerGroup | null = null; // candidate / chosen parking markers
// Segment list starts collapsed on small screens so the panel doesn't eat the map.
let segListExpanded = !window.matchMedia("(max-width: 640px)").matches;
let tour: number[] = [];
let chosenAccess: AccessCandidate | null = null; // the picked start parking
let graphRef: SegmentGraph | null = null;
const edgesById = new Map<number, Edge>();
const vById = new Map<number, Vertex>();
// Genuine dead ends (summits / trail termini) you must retrace out-and-back —
// interior degree-1 vertices; map-boundary stubs (trail leaves our view) excluded.
let retraceVertices = new Set<number>();
// The routing substrate (proto-planner): full-graph adjacency + all dead ends.
let routeGraph: RouteGraph | null = null;
let allDeadEnds = new Set<number>();

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
    layers.push(L.polyline(latlngs, { color: "#fff", weight: 11, opacity: 0.95, interactive: false }));
    const line = L.polyline(latlngs, { color: trailColour(edge.colours), weight: 6, opacity: 1 });
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

// Spotlight one túra segment (hovered/tapped in the panel) in a vivid focus
// colour laid over the túra — so you can find a specific row, e.g. the spur a ↩
// flags, on the map. Pass null to clear.
const EMPHASIS_COLOUR = "#ff2d95";
function emphasize(id: number | null): void {
  emphasisLayer?.remove();
  emphasisLayer = null;
  if (id == null) return;
  const edge = edgesById.get(id);
  if (!edge) return;
  const latlngs = latLngsOf(edge);
  emphasisLayer = L.layerGroup([
    L.polyline(latlngs, { color: "#fff", weight: 15, opacity: 0.9, interactive: false }),
    L.polyline(latlngs, { color: EMPHASIS_COLOUR, weight: 9, opacity: 1, interactive: false }),
  ]).addTo(map);
}

// Candidate parking for the túra (T7d): all distinct lots when none is chosen;
// just the chosen one (green, with a dashed approach line) once picked. Click a
// candidate to choose it as the start; click the chosen one to release it.
function drawAccess(cands: AccessCandidate[]): void {
  accessLayer?.remove();
  const layers: L.Layer[] = [];
  const marker = (c: AccessCandidate, chosen: boolean) => {
    const m = L.marker(toLatLng([c.lon, c.lat]), {
      icon: L.divIcon({
        className: "pmark-wrap",
        html: `<div class="pmark${chosen ? " chosen" : ""}">P</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    });
    const name = c.name ? escapeHtml(c.name) : "parkoló";
    m.bindTooltip(`🅿️ ${name} · ${formatDistance(c.distM)}`, { direction: "top", offset: [0, -10] });
    return m;
  };
  if (chosenAccess) {
    const c = chosenAccess;
    layers.push(
      L.polyline([toLatLng([c.fromLon, c.fromLat]), toLatLng([c.lon, c.lat])], {
        color: "#2f9e44",
        weight: 2.5,
        opacity: 0.9,
        dashArray: "2 7",
        interactive: false,
      }),
    );
    const m = marker(c, true);
    m.on("click", () => {
      chosenAccess = null;
      rebuild();
    });
    layers.push(m);
  } else {
    for (const c of cands) {
      const m = marker(c, false);
      m.on("click", () => {
        chosenAccess = c;
        rebuild();
      });
      layers.push(m);
    }
  }
  accessLayer = L.layerGroup(layers).addTo(map);
}

function renderPanel(cands: AccessCandidate[]): void {
  if (tour.length === 0) {
    infoEl.innerHTML =
      `<div class="hint">Dobj egyet, vagy kattints a térképen egy szakaszra — így építed fel a túrát.</div>`;
    return;
  }
  const oneWay = totalLengthM(tour, edgesById);
  const walking = tourWalkingLengthM(tour, edgesById, retraceVertices);
  const rows = tour
    .map((id) => {
      const e = edgesById.get(id);
      if (!e) return "";
      const swatch = `<span class="swatch" style="background:${trailColour(e.colours)}"></span>`;
      const marks = e.markings.length ? escapeHtml(e.markings.join(" · ")) : "jelzett szakasz";
      const ends = endpointsText(vById.get(e.from) ?? {}, vById.get(e.to) ?? {});
      const endsLabel = ends ? `<span class="seg-ends">${escapeHtml(ends)}</span>` : "";
      const spur = isRetraceSpur(id, edgesById, retraceVertices)
        ? `<span class="seg-spur" title="Zsákutca — oda-vissza, kétszer számít">↩</span>`
        : "";
      return (
        `<li class="seg-row" data-id="${id}"><span class="seg-main">${swatch}${marks}${endsLabel}</span>` +
        spur +
        `<span class="seg-len">${formatDistance(e.lengthM)}</span>` +
        `<button class="seg-remove" type="button" data-id="${id}" title="Töröld a szakaszt">✕</button></li>`
      );
    })
    .join("");
  let accessLine = "";
  if (chosenAccess) {
    const name = chosenAccess.name ? escapeHtml(chosenAccess.name) : "parkoló";
    const szell = haversine([chosenAccess.lon, chosenAccess.lat], SZELL);
    accessLine =
      `<div class="access">🅿️ Indulás: ${name} · ${escapeHtml(formatDistance(chosenAccess.distM))}</div>` +
      `<div class="access sub">🚗 Széll Kálmán tértől ${escapeHtml(formatDistance(szell))}</div>`;
  } else if (cands.length) {
    accessLine = `<div class="access">🅿️ Válassz indulási parkolót a térképen (${cands.length})</div>`;
  }
  // Headline the real walking distance; note the oda-vissza extra when a spur
  // makes it exceed the one-way sum of the segments.
  const odaVissza =
    walking > oneWay
      ? `<div class="access sub">↩ zsákutcával oda-vissza · +${escapeHtml(formatDistance(walking - oneWay))}</div>`
      : "";
  // Discontinuity: the túra is in several disconnected pieces. Warn + offer to
  // route the missing trail between them (the proto-planner).
  const pieces = tourComponents(tour, edgesById).length;
  const warnLine =
    pieces > 1
      ? `<div class="warn">⚠️ Nem összefüggő túra · ${pieces} külön rész` +
        `<button class="fill-gap" type="button">Töltsd ki a hézagot ↝</button></div>`
      : "";
  // Close the loop: offer it for a continuous túra that has two or more live
  // open ends (dead-end spurs don't count — they're out-and-back). Routes them
  // back together over the rest of the net so you walk a loop, not a there-back.
  const liveEnds = tourOpenEnds(tour, edgesById).filter((v) => !allDeadEnds.has(v));
  const loopBtn =
    pieces === 1 && liveEnds.length >= 2
      ? `<button class="close-loop" type="button">🔄 Zárd be a kört</button>`
      : "";
  // The segment list is collapsible (tap the header) — closed by default on phones
  // so the panel doesn't cover the map.
  const caret = segListExpanded ? "▾" : "▸";
  infoEl.innerHTML =
    `<button class="tour-head seg-toggle" type="button" aria-expanded="${segListExpanded}">` +
    `<span class="seg-caret">${caret}</span>` +
    `<span><strong>Túra</strong> · ${tour.length} szakasz · <span class="tour-total">${formatDistance(walking)}</span></span></button>` +
    odaVissza +
    warnLine +
    `<ul class="seg-list${segListExpanded ? "" : " collapsed"}">${rows}</ul>` +
    loopBtn +
    accessLine +
    `<button class="clear" type="button">Ürítsd a túrát</button>`;
}

function updateLinks(): void {
  // With a chosen start, route park → túra → back to the car, and bias the
  // walking order to begin at the túra end nearest the car.
  const chosen = chosenAccess ? ([chosenAccess.lon, chosenAccess.lat] as [number, number]) : null;
  const wp = orderedWaypoints(tour, edgesById, vById, chosen ?? undefined);
  const points = chosen ? [chosen, ...wp, chosen] : wp;
  const mapyUrl = mapyTripUrl(points);
  if (mapyUrl) {
    mapyEl.href = mapyUrl;
    mapyEl.removeAttribute("aria-disabled");
  } else {
    mapyEl.removeAttribute("href");
    mapyEl.setAttribute("aria-disabled", "true");
  }
  // Google Maps drive-to-the-parking (only once a start is chosen). lat,lon order.
  if (chosenAccess) {
    gmapsEl.href = `https://www.google.com/maps/dir/?api=1&destination=${chosenAccess.lat},${chosenAccess.lon}&travelmode=driving`;
    gmapsEl.removeAttribute("aria-disabled");
  } else {
    gmapsEl.removeAttribute("href");
    gmapsEl.setAttribute("aria-disabled", "true");
  }
}

// Persist the túra in the URL hash so it's shareable (no history spam).
function syncHash(): void {
  const body = encodeTourHash(tour, chosenAccess);
  history.replaceState(null, "", body ? `#${body}` : location.pathname + location.search);
}

// Frame the whole túra (plus its chosen start, or all access candidates).
function fitTour(): void {
  const pts: L.LatLngTuple[] = [];
  for (const id of tour) {
    const e = edgesById.get(id);
    if (e) pts.push(...latLngsOf(e));
  }
  if (!pts.length) return;
  const bounds = L.latLngBounds(pts);
  if (chosenAccess) bounds.extend(toLatLng([chosenAccess.lon, chosenAccess.lat]));
  else for (const c of tourAccessPoints(tour, edgesById, vById)) bounds.extend(toLatLng([c.lon, c.lat]));
  map.fitBounds(bounds, { padding: [70, 70], maxZoom: 16 });
}

function rebuild(): void {
  emphasize(null); // drop any spotlight; rows are re-rendered below
  const cands = tourAccessPoints(tour, edgesById, vById);
  // Drop the chosen start if the túra changed so it's no longer a candidate.
  if (chosenAccess && !cands.some((c) => c.lon === chosenAccess!.lon && c.lat === chosenAccess!.lat)) {
    chosenAccess = null;
  }
  // Keep the segments in walking order (start → finish, from the chosen parking
  // when there is one), so the panel list and shared hash read in sequence.
  const startPt = chosenAccess ? ([chosenAccess.lon, chosenAccess.lat] as [number, number]) : undefined;
  tour = orderedSegments(tour, edgesById, vById, startPt);
  drawTour();
  drawNetwork();
  drawAccess(cands);
  renderPanel(cands);
  updateLinks();
  syncHash();
}

// Panel interactions: remove one segment, or clear the whole túra.
infoEl.addEventListener("click", (ev) => {
  const target = ev.target as HTMLElement;
  const remove = target.closest(".seg-remove") as HTMLElement | null;
  if (remove) {
    toggleInTour(Number(remove.dataset.id));
    return;
  }
  // Collapse / expand the segment list (no full re-render — just toggle classes).
  if (target.closest(".seg-toggle")) {
    segListExpanded = !segListExpanded;
    infoEl.querySelector(".seg-list")?.classList.toggle("collapsed", !segListExpanded);
    const toggle = infoEl.querySelector(".seg-toggle");
    toggle?.setAttribute("aria-expanded", String(segListExpanded));
    const caret = infoEl.querySelector(".seg-caret");
    if (caret) caret.textContent = segListExpanded ? "▾" : "▸";
    return;
  }
  // Tap a row (not its ✕) → spotlight that segment and frame it on the map. This
  // is how you find a row on the map on touch, where there's no hover.
  const row = target.closest(".seg-row") as HTMLElement | null;
  if (row) {
    const id = Number(row.dataset.id);
    emphasize(id);
    const edge = edgesById.get(id);
    if (edge) map.fitBounds(L.latLngBounds(latLngsOf(edge)), { padding: [60, 60], maxZoom: 16 });
    return;
  }
  if (target.closest(".fill-gap")) {
    if (routeGraph) {
      const added = fillTourGaps(tour, edgesById, routeGraph);
      if (added.length) {
        tour = [...tour, ...added];
        rebuild();
        fitTour();
      }
    }
    return;
  }
  if (target.closest(".close-loop")) {
    if (routeGraph) {
      const added = closeTourLoop(tour, edgesById, routeGraph, allDeadEnds);
      if (added.length) {
        tour = [...tour, ...added];
        rebuild();
        fitTour();
      }
    }
    return;
  }
  if (target.closest(".clear")) {
    tour = [];
    chosenAccess = null;
    rebuild();
  }
});

// Hover a segment row → spotlight it on the map; clear when the pointer leaves it.
infoEl.addEventListener("mouseover", (ev) => {
  const row = (ev.target as HTMLElement).closest(".seg-row") as HTMLElement | null;
  if (row) emphasize(Number(row.dataset.id));
});
infoEl.addEventListener("mouseout", (ev) => {
  const row = (ev.target as HTMLElement).closest(".seg-row") as HTMLElement | null;
  if (row && !row.contains(ev.relatedTarget as Node)) emphasize(null);
});

async function init(): Promise<void> {
  const graph = (await fetch(graphUrl).then((r) => r.json())) as SegmentGraph;
  graphRef = graph;
  for (const e of graph.edges) edgesById.set(e.id, e);
  for (const v of graph.vertices) vById.set(v.id, v);

  routeGraph = buildRouteGraph(graph.edges);
  allDeadEnds = deadEndVertices(graph.edges);
  // A dead end you must retrace is an interior degree-1 vertex; a stub sitting on
  // the ~20 km range boundary is just the trail leaving our map, not a terminus.
  retraceVertices = new Set(
    [...allDeadEnds].filter((vid) => {
      const v = vById.get(vid);
      return v && haversine([v.lon, v.lat], SZELL) < RANGE_RADIUS_M - 500;
    }),
  );

  // "Vándor dob" starts a fresh túra from a random seed segment.
  const roll = () => {
    const seed = pickRandomSegment(graph.edges);
    tour = [seed.id];
    chosenAccess = null;
    rebuild();
    fitTour();
  };

  // Restore a shared túra from the URL hash; returns false if there's nothing valid.
  const loadFromHash = (): boolean => {
    const { ids, access } = parseTourHash(location.hash);
    const valid = ids.filter((id) => edgesById.has(id));
    if (valid.length === 0) return false;
    tour = valid;
    chosenAccess = null;
    if (access) {
      const cands = tourAccessPoints(tour, edgesById, vById);
      chosenAccess =
        cands.find((c) => Math.abs(c.lon - access[0]) < 1e-6 && Math.abs(c.lat - access[1]) < 1e-6) ?? null;
    }
    rebuild();
    fitTour();
    return true;
  };

  rollBtn.addEventListener("click", roll);
  map.on("moveend", drawNetwork); // keep the base network in sync on pan/zoom
  // A pasted/edited link navigates the túra; our own writes use replaceState.
  window.addEventListener("hashchange", loadFromHash);
  if (!loadFromHash()) roll(); // open a shared túra, else land on a random one
}

void init();
