// Pure helpers for the picker UI (T3). No DOM, no Leaflet — unit-testable.
import type { Edge } from "../graph/graph.ts";

/** [lon, lat] — the GeoJSON coordinate order used throughout the project. */
export type Point = [number, number];

/** Pick one segment uniformly at random. `rng` is injectable for tests. */
export function pickRandomSegment(edges: Edge[], rng: () => number = Math.random): Edge {
  if (edges.length === 0) throw new Error("no segments to pick from");
  return edges[Math.floor(rng() * edges.length)];
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

/** Human distance, Hungarian decimal comma: 150 → "150 m", 1234 → "1,2 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}
