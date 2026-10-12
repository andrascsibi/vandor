// Pure, offline access-point enrichment (T6). For each graph vertex (every
// segment endpoint) find the nearest *usable* car parking, crow-flies, and bake
// it onto the vertex as `access`. The app draws a dashed straight line from the
// selected segment's ends to these points — a deliberately dumb "nearest car
// access" hint, not a route: it's the turista's job to judge the approach trail.
//
// "Usable" excludes parking you can't actually use as a trailhead (private /
// no / customers-only / permit), while keeping public and paid-public lots.

import { haversine, type AccessPoint, type SegmentGraph, type Vertex } from "./graph.ts";
import type { PoiFeature } from "../ingest/pois.ts";

/** `access` values that make a parking useless as a public trailhead. */
export const BLOCKED_ACCESS = new Set(["private", "no", "customers", "permit", "military"]);

/** Parking POIs a random hiker may actually use (drops private/no/customers/…). */
export function usableParking(pois: PoiFeature[]): PoiFeature[] {
  return pois.filter(
    (p) => p.properties.kind === "parking" && !BLOCKED_ACCESS.has(p.properties.access ?? ""),
  );
}

/**
 * Attach each vertex's nearest parking (crow-flies) as `access`. Returns a new
 * graph; edges are untouched. Vertices with no parking anywhere keep no access.
 */
export function attachAccess(graph: SegmentGraph, parking: PoiFeature[]): SegmentGraph {
  const vertices: Vertex[] = graph.vertices.map((v) => {
    let best: PoiFeature | null = null;
    let bestD = Infinity;
    for (const p of parking) {
      const d = haversine([v.lon, v.lat], p.geometry.coordinates);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return { ...v };
    const access: AccessPoint = {
      lon: best.geometry.coordinates[0],
      lat: best.geometry.coordinates[1],
      distM: Math.round(bestD),
    };
    if (best.properties.name) access.name = best.properties.name;
    return { ...v, access };
  });
  return { vertices, edges: graph.edges };
}
