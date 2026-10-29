import "leaflet/dist/leaflet.css";
import "./style.css";
import * as L from "leaflet";
import graphUrl from "../data/segments.json?url";
import hospitalityUrl from "../data/hospitality.json?url";
import type { Edge, SegmentGraph, Vertex } from "../graph/graph.ts";
import { haversine } from "../graph/graph.ts";
import type { HospitalityData, HospitalityPoi } from "../graph/attach-hospitality.ts";
import {
  hospitalityNear,
  hospitalityIcon,
  hospitalityTooltip,
  segmentsNearHospitality,
} from "./hospitality.ts";
import { SZELL_KALMAN_TER } from "../ingest/overpass.ts";
import {
  pickNovelSegment,
  pickRandomSegment,
  kocaPool,
  segmentsTouchingVertices,
  POPULAR_PLACES,
  formatDistance,
  trailColour,
  poiLabel,
  endpointsText,
  mapyTripUrl,
  segmentsInBounds,
  type GeoBounds,
} from "./trip.ts";
import {
  graded,
  gradeColor,
  gradeStats,
  gradeHistogram,
  topSteep,
  crownBadge,
  steepPool,
  rampGradientCss,
  GRADE_MAX_PCT,
} from "./fajturista.ts";
import { markWalked, isWalked, distinctWalkedCount, type Profile } from "./profile.ts";
import { localProfileStore } from "./profile-store.ts";
import {
  toggleSegment,
  totalLengthM,
  tourAccessPoints,
  encodeTourHash,
  parseTourHash,
  type AccessCandidate,
} from "./tour.ts";
import { planWalk, type TourWalk } from "./walk.ts";
import { surfaceClass, trailFraction, type SurfaceClass } from "./surface.ts";
import {
  DEFAULT_LENS,
  LENSES,
  LENS_META,
  TURISTA_INTRO,
  encodeLens,
  parseLens,
  rollLabel,
  type Lens,
} from "./lens.ts";
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
// and gives cheap click hit-testing. The tolerance fattens each thin line's hit
// area well beyond its 3.5px stroke so a tap (esp. on mobile) lands reliably.
map.createPane("network");
map.getPane("network")!.style.zIndex = "350";
const netRenderer = L.canvas({ pane: "network", padding: 0.5, tolerance: 14 });

const rollBtn = document.getElementById("roll") as HTMLButtonElement;
const infoEl = document.getElementById("info") as HTMLDivElement;
const mapyEl = document.getElementById("mapy") as HTMLAnchorElement;
const gmapsEl = document.getElementById("gmaps") as HTMLAnchorElement;
const lensesEl = document.getElementById("lenses") as HTMLDivElement;
const rollLabelEl = document.getElementById("roll-label") as HTMLSpanElement;
const compassEl = document.getElementById("compass") as HTMLDivElement;
const compassToggle = document.getElementById("compass-toggle") as HTMLButtonElement;
const compassModeEl = document.getElementById("compass-mode") as HTMLDivElement;
const fajStatsEl = document.getElementById("faj-stats") as HTMLDivElement;
const compassIntroEl = document.getElementById("compass-intro") as HTMLParagraphElement;
const panelEl = document.getElementById("panel") as HTMLElement;
const panelHandle = document.getElementById("panel-handle") as HTMLButtonElement;
const panelHandleSummaryEl = document.getElementById("panel-handle-summary") as HTMLSpanElement;
const panelActionsEl = document.getElementById("panel-actions") as HTMLDivElement;

const isMobile = () => window.innerWidth <= 640;

// Capitalise the first letter only (so "kulturista" → "Kulturista").
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The compass info box is collapsible; its state is sticky (localStorage). Default:
// open on desktop (room to read Benedek's quotes), closed on mobile (keep the folded
// panel compact — "basically just the compass").
const COMPASS_EXPANDED_KEY = "vandor.compass.expanded";
function loadCompassExpanded(): boolean {
  try {
    const stored = localStorage.getItem(COMPASS_EXPANDED_KEY);
    if (stored !== null) return stored !== "0";
  } catch {
    /* storage blocked — fall through to the viewport default */
  }
  return !isMobile();
}
function saveCompassExpanded(v: boolean): void {
  try {
    localStorage.setItem(COMPASS_EXPANDED_KEY, v ? "1" : "0");
  } catch {
    /* private mode / storage full — the preference just won't persist */
  }
}
let compassExpanded = loadCompassExpanded();
function applyCompassExpanded(): void {
  compassEl.classList.toggle("expanded", compassExpanded);
  compassToggle.setAttribute("aria-expanded", String(compassExpanded));
  const caret = compassToggle.querySelector(".compass-caret");
  if (caret) caret.textContent = compassExpanded ? "▾" : "▸";
}
compassToggle.addEventListener("click", () => {
  compassExpanded = !compassExpanded;
  saveCompassExpanded(compassExpanded);
  applyCompassExpanded();
});

// On mobile the panel folds down to just the compass so the map stays in view while
// you throw the dice / switch lenses; the handle expands the túra body back, and
// committing an action (roll, close-loop, fill-gap) re-collapses it. Collapsed is the
// default. (On desktop the body is always shown — the class is a no-op there.)
let panelExpanded = false;
function applyPanelExpanded(): void {
  panelEl.classList.toggle("panel-open", panelExpanded);
  panelHandle.setAttribute("aria-expanded", String(panelExpanded));
  const chevron = panelHandle.querySelector(".panel-handle-chevron");
  if (chevron) chevron.textContent = panelExpanded ? "▴" : "▾";
}
function collapsePanel(): void {
  if (!panelExpanded) return;
  panelExpanded = false;
  applyPanelExpanded();
}
panelHandle.addEventListener("click", () => {
  panelExpanded = !panelExpanded;
  applyPanelExpanded();
});

// Where each lens sits on the compass rose — the geography encodes the philosophy:
// turista (N) opposite its shadow the kóca (S); faj-turista (E, the dawn climb)
// opposite kultúrista (W, the sunset wine). See docs/TURISTA-LENSES.md.
const LENS_POS: Record<Lens, "n" | "e" | "s" | "w"> = {
  turista: "n",
  fajturista: "e",
  kocaturista: "s",
  kulturista: "w",
};

// The dice's knob: a little triangle on the dice edge pointing at the active lens's
// sector. Clockwise degrees from north (up), matching LENS_POS's cardinal points.
const KNOB_ANGLE: Record<"n" | "e" | "s" | "w", number> = { n: 0, e: 90, s: 180, w: 270 };

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
// How far an already-walked segment fades in the base network (kept subtle — the
// map is a quiet record of where you've been, not a conquest scoreboard).
const WALKED_FADE = 0.4;

// At-a-glance underfoot emphasis in the base network (T10a). Keep the waymark
// colour (it still reads the trail's route), full line weight and full opacity;
// vary only the dash pattern so a natural trail reads as solid, settlement paving
// as dashed, and motor road as dotted — fading as well made them vanish where a
// route coincides with a map path. Hover overrides to a bold solid line.
const SURFACE_STYLE: Record<SurfaceClass, { weight: number; opacity: number; dashArray?: string }> = {
  trail: { weight: BASE_WEIGHT, opacity: BASE_OPACITY },
  paved: { weight: BASE_WEIGHT, opacity: BASE_OPACITY, dashArray: "6 5" },
  road: { weight: BASE_WEIGHT, opacity: BASE_OPACITY, dashArray: "1 4" },
};

// The túra highlight is a thicker line (weight 6) with round caps that fatten each
// dash, so the base patterns above mash into a near-solid line. These sparser
// patterns keep clear dashes/dots on the highlight so the paved share stays legible.
const HIGHLIGHT_DASH: Record<SurfaceClass, string | undefined> = {
  trail: undefined,
  paved: "10 14",
  road: "1 14",
};

// The 🩸 faj-turista aura (T12d): a segment's steepness painted as a translucent
// screen-space glow. A true per-pixel distance field (opacity 1 within 8 px of the
// line, fading to 0 by 16 px) is approximated by a stack of concentric strokes —
// widest + faintest at the ±16 px rim, built up to a crisp core. Source-over means
// the centre accumulates to near-opaque while the rim keeps the faint outer alpha,
// so the profile reads exactly as asked (plateau in the middle, fade at the edge).
// Widths are in pixels, so the aura is 8/16 px on screen at any zoom. The core line
// (last entry) is the clickable one; the rim strokes are inert.
const AURA_STACK: readonly { weight: number; opacity: number }[] = [
  { weight: 16, opacity: 0.1 }, // ±8 px rim → fades out by ±16 px of line width
  { weight: 11, opacity: 0.16 },
  { weight: 8, opacity: 0.22 }, // the ~8 px "full" plateau begins here
  { weight: 3.5, opacity: 0.95 }, // crisp core (also the hit target)
];

// A túra (T7) is an ordered list of edge ids the user assembles by clicking.
let network: L.LayerGroup | null = null; // base (non-túra) segments, canvas pane
let tourLayer: L.LayerGroup | null = null; // the túra's highlighted segments + dots
let emphasisLayer: L.LayerGroup | null = null; // the one segment hovered/tapped in the panel
let accessLayer: L.LayerGroup | null = null; // candidate / chosen parking markers
let hospitalityLayer: L.LayerGroup | null = null; // 🍷 kultúrista pins near the túra
let fajCrownLayer: L.LayerGroup | null = null; // 🩸 faj-turista top-5 steepest crown badges
// Segment list starts collapsed on small screens so the panel doesn't eat the map.
let segListExpanded = !window.matchMedia("(max-width: 640px)").matches;
let tour: number[] = [];
let chosenAccess: AccessCandidate | null = null; // the picked start parking
// The active turista-lens (T12a). A lens is a reading of the land, not a planning
// mode — it never touches the túra. Substrate for now: the switch works, highlights,
// and rides along in the shared hash; the kultúrista/faj-turista/kóca overlays hang
// off it in T12b–d. See docs/TURISTA-LENSES.md.
let lens: Lens = DEFAULT_LENS;
let lensBtns: HTMLButtonElement[] = [];
let graphRef: SegmentGraph | null = null;
// The committed hospitality layer (T12b), loaded once and split by kind: picnic is
// the real turista's affair (everything in the backpack), food/drink the kultúrista's.
// `nearTour` is the active lens's subset in sétatáv of the túra, set in `rebuild`.
let allHospitality: HospitalityPoi[] = [];
let picnicPois: HospitalityPoi[] = [];
let foodDrinkPois: HospitalityPoi[] = [];
let hospitalityNearTour: HospitalityPoi[] = [];
// Trail seeds the kultúrista dob rolls from: natural-trail segments with food/drink
// on or close to them (built once in `init`). Empty → the roll falls back to novelty.
let kulturistaSeeds: Edge[] = [];
// All trail-surface seeds (built in `init`) — the default novelty-roll pool, and the
// fallback for lens rolls with an empty themed pool.
let trailSeeds: Edge[] = [];
const edgesById = new Map<number, Edge>();
const edgeByKey = new Map<string, Edge>(); // stable key → edge, for shared links
const vById = new Map<number, Vertex>();
// How the current túra is walked (ordering + any doubled segments); recomputed by
// `rebuild`. Closed (returns to the car) once a parking is chosen, else linear.
let walk: TourWalk = { steps: [], coords: [], lengthM: 0, closed: false };
// The routing substrate (proto-planner): full-graph adjacency + all dead ends.
let routeGraph: RouteGraph | null = null;
let allDeadEnds = new Set<number>();
// The Vándor's personal walk history (the north star): which segments are walked,
// persisted locally. Drives the novelty-weighted roll and the faded "done" lines.
const profileStore = localProfileStore();
let profile: Profile = profileStore.load();

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
  const lines = visible.flatMap((edge) =>
    lens === "fajturista" ? fajNetworkLines(edge) : surfaceNetworkLines(edge),
  );
  network?.remove();
  network = L.layerGroup(lines).addTo(map);
}

/** The default (non-faj) rendering of one base segment: a waymark-coloured line. */
function surfaceNetworkLines(edge: Edge): L.Layer[] {
  const st = SURFACE_STYLE[surfaceClass(edge.highway)];
  // A segment you've already walked is faded — a "learned flashcard". The map
  // fills with faint lines as you cover the hills, and the untrodden stays bold.
  const walked = isWalked(profile, edge.key);
  const weight = walked ? st.weight * 0.7 : st.weight;
  const opacity = walked ? st.opacity * WALKED_FADE : st.opacity;
  const pl = L.polyline(latLngsOf(edge), {
    renderer: netRenderer,
    pane: "network",
    color: trailColour(edge.colours),
    weight,
    opacity,
    dashArray: st.dashArray,
  });
  pl.on("click", () => toggleInTour(edge.id));
  pl.on("mouseover", () => {
    pl.setStyle({ weight: 6, opacity: 1, dashArray: undefined });
    map.getContainer().style.cursor = "pointer";
  });
  pl.on("mouseout", () => {
    pl.setStyle({ weight, opacity, dashArray: st.dashArray });
    map.getContainer().style.cursor = "";
  });
  return [pl];
}

/**
 * The 🩸 faj-turista rendering of one base segment: the steepness aura (sign colour
 * is irrelevant to the predator — delta_h replaces it). A stack of translucent rim
 * strokes building to a crisp clickable core, all tinted by the segment's grade so
 * steep ones blaze red and flat ones recede. A segment the DEM couldn't reach has
 * no grade — drawn as a faint neutral line so it's still clickable, never coloured.
 */
function fajNetworkLines(edge: Edge): L.Layer[] {
  const latlngs = latLngsOf(edge);
  const walked = isWalked(profile, edge.key);
  // Walked history still dims the glow (the flashcard feel survives the lens), but
  // the hue stays true to the land's steepness.
  const dim = walked ? WALKED_FADE : 1;
  if (!edge.elevation) {
    const pl = L.polyline(latlngs, {
      renderer: netRenderer,
      pane: "network",
      color: "#9aa0a6",
      weight: 3,
      opacity: 0.4 * dim,
    });
    pl.on("click", () => toggleInTour(edge.id));
    return [pl];
  }
  const color = gradeColor(edge.elevation.grade);
  const layers: L.Layer[] = [];
  // Rim strokes: inert, widest→narrowest, building the glow.
  for (let i = 0; i < AURA_STACK.length - 1; i++) {
    const s = AURA_STACK[i];
    layers.push(
      L.polyline(latlngs, {
        renderer: netRenderer,
        pane: "network",
        color,
        weight: s.weight,
        opacity: s.opacity * dim,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }),
    );
  }
  // Core: the crisp centre + the hit target for add-to-túra.
  const core = AURA_STACK[AURA_STACK.length - 1];
  const pl = L.polyline(latlngs, {
    renderer: netRenderer,
    pane: "network",
    color,
    weight: core.weight,
    opacity: core.opacity * dim,
    lineCap: "round",
  });
  pl.on("click", () => toggleInTour(edge.id));
  pl.on("mouseover", () => {
    pl.setStyle({ weight: 6, opacity: 1 });
    map.getContainer().style.cursor = "pointer";
  });
  pl.on("mouseout", () => {
    pl.setStyle({ weight: core.weight, opacity: core.opacity * dim });
    map.getContainer().style.cursor = "";
  });
  layers.push(pl);
  return layers;
}

/** Midpoint [lon,lat] of a segment's polyline (the vertex nearest the middle). */
function edgeMidpoint(edge: Edge): [number, number] {
  return edge.coordinates[Math.floor(edge.coordinates.length / 2)];
}

/**
 * The 🩸 top-5 steepest segments wear a crown badge ("👑 #1 · 27%") at their
 * midpoint — Benedek's podium, so the faj-turista can eyeball the hardest climbs
 * without reading every aura. Only under the faj-turista lens; tapping one frames
 * that segment. Drawn from the whole network (the podium is global, not per-view).
 */
function drawFajCrowns(): void {
  fajCrownLayer?.remove();
  fajCrownLayer = null;
  if (lens !== "fajturista" || !graphRef) return;
  const podium = topSteep(graded(graphRef.edges));
  const markers = podium.map(({ edge, rank }) => {
    const [lon, lat] = edgeMidpoint(edge);
    const m = L.marker(toLatLng([lon, lat]), {
      icon: L.divIcon({
        className: "faj-crown",
        html: `<span style="background:${gradeColor(edge.elevation.grade)}">${escapeHtml(
          crownBadge(rank, edge.elevation.grade),
        )}</span>`,
        iconSize: undefined as unknown as L.PointTuple,
      }),
      title: edge.name ?? `#${rank} legmeredekebb szakasz`,
    });
    m.on("click", () => {
      map.fitBounds(L.latLngBounds(latLngsOf(edge)), { padding: [80, 80], maxZoom: 16 });
    });
    return m;
  });
  fajCrownLayer = L.layerGroup(markers).addTo(map);
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
    // Dash/dot the highlight by surface too (over the solid white casing, so gaps
    // read as white) — the turista sees at a glance how much of the túra is paved.
    layers.push(
      L.polyline(latlngs, {
        color: trailColour(edge.colours),
        weight: 6,
        opacity: 1,
        dashArray: HIGHLIGHT_DASH[surfaceClass(edge.highway)],
        interactive: false,
      }),
    );
    // A fat, invisible hit-line over the casing so a selected segment is easy to
    // tap off (the visible 6px line is a tiny target, esp. on mobile). The click
    // removes the segment; this is the only interactive layer of the three.
    const hit = L.polyline(latlngs, { color: "#000", weight: 26, opacity: 0, lineCap: "round" });
    hit.on("click", () => toggleInTour(id));
    hit.on("mouseover", () => { map.getContainer().style.cursor = "pointer"; });
    hit.on("mouseout", () => { map.getContainer().style.cursor = ""; });
    layers.push(hit);
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

// The anchors the 🍷 overlay hangs off: every distinct túra endpoint, plus the
// chosen start parking (or all candidate parkings while none is picked) — the
// places a turista starts from or ends at, and so would detour to eat around.
function tourAnchors(cands: AccessCandidate[]): [number, number][] {
  const anchors: [number, number][] = [];
  const seen = new Set<number>();
  for (const id of tour) {
    const e = edgesById.get(id);
    if (!e) continue;
    for (const vid of [e.from, e.to]) {
      if (seen.has(vid)) continue;
      seen.add(vid);
      const v = vById.get(vid);
      if (v) anchors.push([v.lon, v.lat]);
    }
  }
  for (const c of chosenAccess ? [chosenAccess] : cands) anchors.push([c.lon, c.lat]);
  return anchors;
}

// Which hospitality the active lens reads from the land: picnic for the real
// turista (who carries everything in the backpack — a piknik is his), food/drink
// for the kultúrista (a piknik only annoys him; he brought nothing). Other lenses
// draw no hospitality.
function lensOverlayPois(): HospitalityPoi[] {
  if (lens === "turista") return picnicPois;
  if (lens === "kulturista") return foodDrinkPois;
  return [];
}

// The hospitality overlay: an emoji pin at each POI in sétatáv of the túra. Which
// kinds show depends on the lens (`lensOverlayPois`); `hospitalityNearTour` (set in
// `rebuild`) is empty under every non-overlay lens, so switching away clears it.
function drawHospitality(): void {
  hospitalityLayer?.remove();
  hospitalityLayer = null;
  if (hospitalityNearTour.length === 0) return;
  const markers = hospitalityNearTour.map((p) => {
    const m = L.marker(toLatLng([p.lon, p.lat]), {
      icon: L.divIcon({
        className: "hmark-wrap",
        html: `<div class="hmark">${hospitalityIcon(p.kind)}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    });
    m.bindTooltip(escapeHtml(hospitalityTooltip(p)), { direction: "top", offset: [0, -11] });
    return m;
  });
  hospitalityLayer = L.layerGroup(markers).addTo(map);
}

function renderPanel(cands: AccessCandidate[]): void {
  if (tour.length === 0) {
    const done = distinctWalkedCount(profile);
    const tally = done
      ? `<div class="hint done-tally">🥾 Eddig ${done} szakaszt jártál be — a többi vár.</div>`
      : "";
    infoEl.innerHTML =
      `<div class="hint">Dobj egyet, vagy kattints a térképen egy szakaszra — így építed fel a túrát.</div>` +
      tally;
    panelActionsEl.innerHTML = ""; // no túra → no collapsed-mode actions
    panelHandleSummaryEl.textContent = ""; // …and nothing to summarise on the handle
    return;
  }
  const oneWay = totalLengthM(tour, edgesById);
  const walking = walk.lengthM;
  // One row per *traversal* (walking order): a doubled segment appears twice, the
  // second time flagged ↩ as the return leg. The ✕ drops the segment entirely.
  const seenStep = new Set<number>();
  const rows = walk.steps
    .map(({ id }) => {
      const e = edgesById.get(id);
      if (!e) return "";
      const isReturn = seenStep.has(id);
      seenStep.add(id);
      const swatch = `<span class="swatch" style="background:${trailColour(e.colours)}"></span>`;
      const marks = e.markings.length ? escapeHtml(e.markings.join(" · ")) : "jelzett szakasz";
      const ends = endpointsText(vById.get(e.from) ?? {}, vById.get(e.to) ?? {});
      const endsLabel = ends ? `<span class="seg-ends">${escapeHtml(ends)}</span>` : "";
      const spur = isReturn
        ? `<span class="seg-spur" title="Oda-vissza — ezt a szakaszt visszafelé is járod">↩</span>`
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
  // Headline the real walking distance; note the oda-vissza extra when closing the
  // loop back to the car makes it exceed the one-way sum of the segments.
  const odaVissza =
    walking > oneWay
      ? `<div class="access sub">↩ oda-vissza · +${escapeHtml(formatDistance(walking - oneWay))}</div>`
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
  const canLoop = pieces === 1 && liveEnds.length >= 2;
  const loopBtn = canLoop
    ? `<button class="close-loop" type="button">🔄 Zárd be a kört</button>`
    : "";
  // The same actions as icon-only pills for collapsed mode (reuse the classes so the
  // one delegated handler on #panel drives both). Clear is always offered for a túra.
  const actions: string[] = [];
  if (pieces > 1)
    actions.push(`<button class="pa-btn fill-gap" type="button" title="Töltsd ki a hézagot" aria-label="Töltsd ki a hézagot">🧩</button>`);
  if (canLoop)
    actions.push(`<button class="pa-btn close-loop" type="button" title="Zárd be a kört" aria-label="Zárd be a kört">🔄</button>`);
  actions.push(`<button class="pa-btn clear" type="button" title="Ürítsd a túrát" aria-label="Ürítsd a túrát">🗑️</button>`);
  panelActionsEl.innerHTML = actions.join("");
  // The hospitality count in sétatáv of the túra. Under 🍷 kultúrista: étterem/büfé
  // (the családi field note's "étterem sétatávban a végén"), with a quiet "nincs"
  // when none. Under 🧭 turista: piknikhely, shown only when there are some so the
  // default view stays uncluttered. Empty under the other lenses.
  let hospLine = "";
  if (lens === "kulturista") {
    hospLine = hospitalityNearTour.length
      ? `<div class="access hosp">🍴 ${hospitalityNearTour.length} vendéglátóhely a közelben</div>`
      : `<div class="access sub">🍷 Nincs vendéglátás a túra közelében</div>`;
  } else if (lens === "turista" && hospitalityNearTour.length) {
    hospLine = `<div class="access sub">🧺 ${hospitalityNearTour.length} piknikhely a közelben</div>`;
  }
  // The segment list is collapsible (tap the header) — closed by default on phones
  // so the panel doesn't cover the map.
  const caret = segListExpanded ? "▾" : "▸";
  // Share of the walking distance on natural trail (vs settlement paving / road) —
  // a surface-quality glance alongside the distance.
  const trailPct = Math.round(
    trailFraction(walk.steps.map((s) => edgesById.get(s.id)).filter((e): e is Edge => !!e)) * 100,
  );
  // A "how far from town" metric, shown both in the header and on the collapsed-mode
  // expand chevron: the crow-flies from Széll Kálmán tér out to the parking — the
  // chosen start once picked, otherwise the candidate parking nearest to Széll (the
  // likeliest start), so the figure stays a consistent drive-out distance either way.
  let accessText = "";
  let accessTitle = "";
  const szellOf = (c: { lon: number; lat: number }) => haversine([c.lon, c.lat], SZELL);
  if (chosenAccess) {
    accessText = `🚗 ${formatDistance(szellOf(chosenAccess))}`;
    accessTitle = "Széll Kálmán tértől a parkolóig (madártávlat)";
  } else if (cands.length) {
    const nearest = cands.reduce((a, b) => (szellOf(b) < szellOf(a) ? b : a));
    accessText = `🚗 ${formatDistance(szellOf(nearest))}`;
    accessTitle = "Széll Kálmán tértől a hozzá legközelebbi parkolóig (madártávlat)";
  }
  const accessChip = accessText
    ? ` · <span class="tour-access" title="${escapeHtml(accessTitle)}">${escapeHtml(accessText)}</span>`
    : "";
  // The collapsed panel (mobile) hides the túra card, so surface the same at-a-glance
  // metrics on the expand chevron itself — distance · % underfoot · access.
  panelHandleSummaryEl.textContent =
    `${formatDistance(walking)} · ${trailPct}% 🥾` + (accessText ? ` · ${accessText}` : "");
  infoEl.innerHTML =
    `<button class="tour-head seg-toggle" type="button" aria-expanded="${segListExpanded}">` +
    `<span class="seg-caret">${caret}</span>` +
    `<span><strong>Túra</strong> · ${tour.length} szakasz · <span class="tour-total">${formatDistance(walking)}</span>` +
    ` · <span class="tour-trail" title="A táv ${trailPct}%-a természetes ösvény">${trailPct}% 🥾</span>` +
    accessChip +
    `</span></button>` +
    odaVissza +
    warnLine +
    `<ul class="seg-list${segListExpanded ? "" : " collapsed"}">${rows}</ul>` +
    loopBtn +
    accessLine +
    hospLine +
    walkedBtn() +
    `<button class="clear" type="button">Ürítsd a túrát</button>`;
}

// "Bejártam": log the whole túra into the personal profile (the flashcards),
// persist it, and fade those lines. If the túra's already fully walked, offer to
// re-log it (another visit — spaced repetition cares when, not just whether).
function walkedBtn(): string {
  const keys = tourKeys();
  const allDone = keys.length > 0 && keys.every((k) => isWalked(profile, k));
  const label = allDone ? "✓ Újra bejártam" : "✓ Bejártam";
  return `<button class="walked${allDone ? " done" : ""}" type="button">${label}</button>`;
}

// The stable keys of the túra's segments — the profile keys on these, not the
// build-order edge index, so walk history survives a graph re-ingest.
function tourKeys(): string[] {
  return tour.map((id) => edgesById.get(id)?.key).filter((k): k is string => !!k);
}

// Record the current túra's segments as walked, save, and redraw (faded).
function markTourWalked(): void {
  profile = markWalked(profile, tourKeys());
  profileStore.save(profile);
  rebuild();
}

function updateLinks(): void {
  // The walk already runs in order (and, with a parking, closes back to the start
  // vertex). With a chosen start we bookend it with the car so Mapy routes
  // park → túra → park; the two park legs are just the approach in and out.
  const chosen = chosenAccess ? ([chosenAccess.lon, chosenAccess.lat] as [number, number]) : null;
  const points = chosen ? [chosen, ...walk.coords, chosen] : walk.coords;
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

// Persist the túra + active lens in the URL hash so it's shareable (no history
// spam). We encode the segments' stable keys, not their indices, so a shared link
// survives a graph re-ingest (see tour.ts); the lens rides along too (lens.ts), the
// default encoding to "" so plain links stay clean.
function syncHash(): void {
  const body = [encodeTourHash(tourKeys(), chosenAccess), encodeLens(lens)].filter(Boolean).join("&");
  history.replaceState(null, "", body ? `#${body}` : location.pathname + location.search);
}

// Build the compass's lens buttons once (icons from LENS_META, so the vocabulary has
// one home), each placed on its cardinal point of the rose.
function renderLensBar(): void {
  lensBtns = LENSES.map((l) => {
    const m = LENS_META[l];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `lens pos-${LENS_POS[l]}`;
    btn.dataset.lens = l;
    // The glyph lives in its own span so it can sit out at the sector's mid-radius
    // (the button itself is a full-ring square clipped to a bent-trapezoid wedge).
    const glyph = document.createElement("span");
    glyph.className = "lens-glyph";
    glyph.textContent = m.icon;
    btn.appendChild(glyph);
    btn.title = `${m.label} — ${m.note}`;
    btn.setAttribute("aria-label", m.label);
    btn.setAttribute("aria-pressed", String(l === lens));
    btn.addEventListener("click", () => setLens(l));
    return btn;
  });
  lensesEl.replaceChildren(...lensBtns);
}

// Reflect the current lens into the DOM without re-planning: the pressed compass
// button, a body data-attribute (a styling/behaviour hook for the lens overlays), the
// dice caption (+ aria), and the info box's card for this turista — Benedek's
// characterisation plus what the app does (flagged "hamarosan" while an overlay is
// still substrate).
function reflectLens(): void {
  document.body.dataset.lens = lens;
  // Swing the dice's knob triangle round to point at the active lens's sector.
  compassEl.style.setProperty("--knob-angle", `${KNOB_ANGLE[LENS_POS[lens]]}deg`);
  for (const btn of lensBtns) btn.setAttribute("aria-pressed", String(btn.dataset.lens === lens));
  const m = LENS_META[lens];
  // Each lens rolls with its own strategy, so the caption (and the dice's accessible
  // label) name the active one. The 🎲 glyph on the button stays put.
  const label = rollLabel(lens);
  rollLabelEl.textContent = label;
  rollBtn.setAttribute("aria-label", label);
  const appLine = m.implemented ? m.note : `${m.note} — hamarosan`;
  compassModeEl.innerHTML =
    `<p class="ci-mode-head">${m.icon} ${escapeHtml(capitalize(m.label))}</p>` +
    `<p class="ci-mode-quote">„${escapeHtml(m.blurb)}"</p>` +
    `<p class="ci-mode-app">${escapeHtml(appLine)}</p>`;
  renderFajStats();
}

// The 🩸 faj-turista stats card: the network's whole delta_h distribution at a
// glance — a headline on the steepest segment, four stat tiles, a grade histogram
// (bars tinted by the same ramp as the map, so the chart is also the legend) and a
// ramp legend bar. Shown only under the faj-turista lens; empty if no segment
// carries elevation (a graph built without the DEM).
function renderFajStats(): void {
  if (lens !== "fajturista" || !graphRef) {
    fajStatsEl.hidden = true;
    fajStatsEl.innerHTML = "";
    return;
  }
  const g = graded(graphRef.edges);
  const s = gradeStats(g);
  if (s.count === 0) {
    fajStatsEl.hidden = true;
    return;
  }
  fajStatsEl.hidden = false;

  const steepestName = s.steepest?.name ?? "névtelen fal";
  const head =
    `<button type="button" class="faj-steepest" data-id="${s.steepest?.id ?? ""}" ` +
    `title="Mutasd a térképen">🩸 Legmeredekebb: <strong>${escapeHtml(steepestName)}</strong> ` +
    `· ${Math.round(s.maxGrade)}%</button>`;

  const tile = (n: string, label: string) =>
    `<div class="faj-tile"><span class="faj-tile-n">${n}</span><span class="faj-tile-l">${label}</span></div>`;
  const tiles =
    `<div class="faj-tiles">` +
    tile(`${s.medianGrade.toFixed(1)}%`, "medián lejtés") +
    tile(`${Math.round(s.maxPitch)}%`, "legnagyobb lejtő") +
    tile(`${s.p90Grade.toFixed(1)}%`, "p90 lejtés") +
    tile(`${(s.totalGainM / 1000).toFixed(1)} km`, "összes emelkedő") +
    `</div>`;

  const bins = gradeHistogram(g);
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const bars = bins
    .map(
      (b) =>
        `<div class="faj-bar" style="height:${Math.max(3, (b.count / maxCount) * 100)}%;background:${b.color}" ` +
        `title="${b.lo}–${b.hi}% lejtés · ${b.count} szakasz"></div>`,
    )
    .join("");
  const hist =
    `<div class="faj-hist" role="img" aria-label="Lejtés-eloszlás: ${s.count} szakasz">` +
    `<div class="faj-hist-bars">${bars}</div>` +
    `<div class="faj-hist-axis"><span>lapos</span><span>delta_h →</span><span>${bins[bins.length - 1].hi}%</span></div>` +
    `</div>`;

  const legend =
    `<div class="faj-legend"><div class="faj-legend-bar" style="background:${rampGradientCss()}"></div>` +
    `<div class="faj-legend-labels"><span>0%</span><span>${GRADE_MAX_PCT}%+</span></div></div>`;

  fajStatsEl.innerHTML = head + tiles + hist + legend;
}

// Switch lenses: update the UI, then rebuild so any lens-dependent layers refresh
// (none yet in T12a) and the new lens is written into the shareable hash.
function setLens(next: Lens): void {
  if (next === lens) return;
  lens = next;
  reflectLens();
  rebuild();
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
  // Plan the walk: linear while no parking is chosen, a closed loop (returning to
  // the car) once one is — doubling whatever must be retraced. The panel list, the
  // headline distance and the Mapy link all read off this.
  const startPt = chosenAccess ? ([chosenAccess.lon, chosenAccess.lat] as [number, number]) : undefined;
  walk = planWalk(tour, edgesById, vById, { start: startPt, close: !!chosenAccess });
  // The hospitality overlay reads the land around the túra — the kinds the active
  // lens cares about (picnic for turista, food/drink for kultúrista), in sétatáv.
  const overlayPois = lensOverlayPois();
  hospitalityNearTour = overlayPois.length ? hospitalityNear(overlayPois, tourAnchors(cands)) : [];
  drawTour();
  drawNetwork();
  drawAccess(cands);
  drawHospitality();
  drawFajCrowns();
  renderPanel(cands);
  updateLinks();
  syncHash();
}

// Panel interactions (delegated on the whole hub so the collapsed-mode action pills
// in #panel-actions share the handlers with the body's text buttons). The compass's
// own controls — lens toggles, the dice, the caption and handle — carry no matching
// class, so they fall through here to their dedicated listeners.
panelEl.addEventListener("click", (ev) => {
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
        collapsePanel(); // reveal the filled-in túra on the map
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
        collapsePanel(); // reveal the closed loop on the map
      }
    }
    return;
  }
  if (target.closest(".walked")) {
    markTourWalked();
    return;
  }
  if (target.closest(".clear")) {
    tour = [];
    chosenAccess = null;
    rebuild();
  }
});

// Tap the 🩸 stats headline → frame the steepest segment on the map and spotlight it.
fajStatsEl.addEventListener("click", (ev) => {
  const btn = (ev.target as HTMLElement).closest(".faj-steepest") as HTMLElement | null;
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const edge = edgesById.get(id);
  if (edge) {
    emphasize(id);
    map.fitBounds(L.latLngBounds(latLngsOf(edge)), { padding: [80, 80], maxZoom: 16 });
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
  for (const e of graph.edges) {
    edgesById.set(e.id, e);
    edgeByKey.set(e.key, e);
  }
  for (const v of graph.vertices) vById.set(v.id, v);

  // The 🍷 hospitality layer (T12b). Non-fatal if absent (run `npm run graph`).
  try {
    const hosp = (await fetch(hospitalityUrl).then((r) => r.json())) as HospitalityData;
    allHospitality = hosp.pois ?? [];
  } catch {
    allHospitality = [];
  }
  // Split by kind once: picnic belongs to the turista overlay, food/drink to the
  // kultúrista overlay + its roll pool.
  picnicPois = allHospitality.filter((p) => p.kind === "picnic");
  foodDrinkPois = allHospitality.filter((p) => p.kind !== "picnic");

  routeGraph = buildRouteGraph(graph.edges);
  allDeadEnds = deadEndVertices(graph.edges);

  // Build the compass and adopt any lens from the opening hash (shared link).
  lens = parseLens(location.hash);
  compassIntroEl.textContent = TURISTA_INTRO;
  applyCompassExpanded();
  applyPanelExpanded();
  renderLensBar();
  reflectLens();

  // The dob starts a fresh túra from a seed segment — only ever a natural trail
  // (T10a), never a settlement street or motor road. Each lens then rolls with its
  // own strategy (T12b): the land it reads shapes what "véletlen" means.
  trailSeeds = graph.edges.filter((e) => surfaceClass(e.highway) === "trail");
  // The kultúrista dob rolls from trail seeds with food/drink on or close to them —
  // walked or not, the only thing that matters to him is the hospitality nearby.
  kulturistaSeeds = segmentsNearHospitality(trailSeeds, foodDrinkPois);
  // The kóca's famous-spot seed: segments touching a POPULAR_PLACES summit. Matched
  // by vertex name so a rebuild can't shuffle it out from under us.
  const popularVertexIds = new Set(
    graph.vertices.filter((v) => v.name !== undefined && POPULAR_PLACES.includes(v.name)).map((v) => v.id),
  );
  const kocaPopular = segmentsTouchingVertices(graph.edges, popularVertexIds);

  const novelty = () => pickNovelSegment(trailSeeds.length ? trailSeeds : graph.edges, profile);
  // Per-lens seed strategy:
  //  🧭 turista   — the north star: favour the untrodden (novelty-weighted).
  //  🍷 kultúrista — any segment near food/drink, uniformly (visited or new alike).
  //  🩸 faj-turista — the steepest: roll the steep quantile, novelty-weighted among
  //                   them so it's a hard climb yet still leans to the untrodden.
  //  🐷 kóca       — the anti-Vándor: the famous spots + paths already walked, uniformly.
  const rollSeed = (): Edge => {
    switch (lens) {
      case "kulturista":
        return kulturistaSeeds.length ? pickRandomSegment(kulturistaSeeds) : novelty();
      case "kocaturista": {
        const pool = kocaPool(kocaPopular, graph.edges, profile);
        return pool.length ? pickRandomSegment(pool) : novelty();
      }
      case "fajturista": {
        const pool = steepPool(trailSeeds.length ? trailSeeds : graph.edges);
        return pool.length ? pickNovelSegment(pool, profile) : novelty();
      }
      case "turista":
      default:
        return novelty();
    }
  };
  const roll = () => {
    const seed = rollSeed();
    tour = [seed.id];
    chosenAccess = null;
    rebuild();
    fitTour();
    collapsePanel(); // show the fresh segment on the map, not behind the panel
  };

  // Restore a shared túra from the URL hash; returns false if there's nothing valid.
  const loadFromHash = (): boolean => {
    const { keys, access } = parseTourHash(location.hash);
    // Map each shared stable key back to its current edge index; unknown keys
    // (an edge that changed since the link was made) are simply dropped.
    const valid = keys.map((k) => edgeByKey.get(k)?.id).filter((id): id is number => id !== undefined);
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
  window.addEventListener("hashchange", () => {
    lens = parseLens(location.hash); // adopt a pasted link's lens too
    reflectLens();
    loadFromHash();
  });
  if (!loadFromHash()) roll(); // open a shared túra, else land on a random one
}

void init();
