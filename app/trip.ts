// Pure helpers for the picker UI (T3). No DOM, no Leaflet — unit-testable.
import type { AccessPoint, Edge } from "../graph/graph.ts";

/** [lon, lat] — the GeoJSON coordinate order used throughout the project. */
export type Point = [number, number];

/** Pick one segment uniformly at random. `rng` is injectable for tests. */
export function pickRandomSegment(edges: Edge[], rng: () => number = Math.random): Edge {
  if (edges.length === 0) throw new Error("no segments to pick from");
  return edges[Math.floor(rng() * edges.length)];
}

/** Geographic viewport, degrees (the Leaflet bounds the UI passes in). */
export interface GeoBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Segments whose coordinate bounding box intersects the viewport — the base
 * network to draw for the current view (T5). A bbox test, so a segment whose
 * box overlaps but whose line doesn't quite enter is still kept; cheap and the
 * canvas clips the overflow. Lets us never draw the whole region when zoomed in.
 */
export function segmentsInBounds(edges: Edge[], b: GeoBounds): Edge[] {
  return edges.filter((e) => {
    let w = Infinity;
    let s = Infinity;
    let ee = -Infinity;
    let n = -Infinity;
    for (const [lon, lat] of e.coordinates) {
      if (lon < w) w = lon;
      if (lon > ee) ee = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
    return w <= b.east && ee >= b.west && s <= b.north && n >= b.south;
  });
}

/**
 * The two points to hand to Mapy for a share link. Normally the segment's two
 * endpoints; for a self-loop (both ends the same vertex) we aim at the far side
 * of the loop so Mapy still draws a meaningful walk.
 */
export function shareEndpoints(edge: Edge): [Point, Point] {
  const c = edge.coordinates;
  const start = c[0];
  if (edge.from !== edge.to) return [start, c[c.length - 1]];
  return [start, c[Math.floor(c.length / 2)]];
}

/** Mapy.com pedestrian-hiking route deep link (documented /fnc/v1/route). */
export function mapyRouteUrl(from: Point, to: Point): string {
  const fmt = (p: Point) => `${p[0]},${p[1]}`; // Mapy wants lon,lat — our order
  return (
    "https://mapy.com/fnc/v1/route?mapset=outdoor&routeType=foot_hiking" +
    `&start=${fmt(from)}&end=${fmt(to)}`
  );
}

/**
 * Mapy hiking route through an ordered list of points (T7): first = start,
 * last = end, the rest become `waypoints` (semicolon-separated lon,lat; Mapy
 * caps at 15). Null for fewer than two points. Mapy routes along trails between
 * the junctions we hand it.
 */
export function mapyTripUrl(points: Point[]): string | null {
  if (points.length < 2) return null;
  const fmt = (p: Point) => `${p[0]},${p[1]}`;
  const start = points[0];
  const end = points[points.length - 1];
  const mids = points.slice(1, -1).slice(0, 15);
  const base =
    "https://mapy.com/fnc/v1/route?mapset=outdoor&routeType=foot_hiking" +
    `&start=${fmt(start)}&end=${fmt(end)}`;
  return mids.length ? `${base}&waypoints=${mids.map(fmt).join(";")}` : base;
}

// Named-endpoint labels (T4b). A segment endpoint can carry a POI.
const KIND_ICON: Record<string, string> = {
  peak: "⛰️",
  viewpoint: "🔭",
  spring: "💧",
  shelter: "🛖",
  // saddle has no clear emoji → shown as a plain name.
};

export interface EndpointInfo {
  name?: string;
  poiKind?: string;
}

/** "⛰️ Hármashatár-hegy" for a named endpoint, or null if it has no POI. */
export function poiLabel(v: EndpointInfo): string | null {
  if (!v.name) return null;
  const icon = v.poiKind ? KIND_ICON[v.poiKind] : undefined;
  return icon ? `${icon} ${v.name}` : v.name;
}

/** "⛰️ A → 💧 B" when either endpoint is named; null when neither is. */
export function endpointsText(from: EndpointInfo, to: EndpointInfo): string | null {
  const a = poiLabel(from);
  const b = poiLabel(to);
  if (!a && !b) return null;
  return `${a ?? "·"} → ${b ?? "·"}`;
}

/** Human distance, Hungarian decimal comma: 150 → "150 m", 1234 → "1,2 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

/**
 * Panel text for a segment's nearest car access (T6): "🅿️ 0,4 km · 0,7 km" —
 * the crow-flies parking distance for each end, deduped when both ends share
 * one lot. Null when neither end has an access point.
 */
export function accessSummary(from?: AccessPoint, to?: AccessPoint): string | null {
  const points = [from, to].filter((p): p is AccessPoint => !!p);
  if (points.length === 0) return null;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const p of points) {
    const key = `${p.lon},${p.lat}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(formatDistance(p.distM));
  }
  return `🅿️ ${parts.join(" · ")}`;
}

// Waymark colour → a hex that reads on an OpenTopoMap background (with a white
// casing under the line). Keys are the osmc:symbol waycolours we see in HU.
const COLOUR_HEX: Record<string, string> = {
  blue: "#1c66c9",
  red: "#e03131",
  green: "#2f9e44",
  yellow: "#e0a100",
  purple: "#9c36b5",
  black: "#343a40",
};
const FALLBACK_HEX = "#e8590c";
// A segment can be shared by several routes; show the highest-priority colour.
// National blue (OKT) first, then the other classics.
const COLOUR_PRIORITY = ["blue", "red", "green", "yellow", "purple", "black"];

/** Pick the display hex for a segment's waymark colour(s). */
export function trailColour(colours: string[]): string {
  for (const c of COLOUR_PRIORITY) if (colours.includes(c)) return COLOUR_HEX[c];
  for (const c of colours) if (COLOUR_HEX[c]) return COLOUR_HEX[c];
  return FALLBACK_HEX;
}
