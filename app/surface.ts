// Underfoot surface class from a segment's OSM `highway` tag (T10a) — axis 1 of
// the awesomeness-by-surface model (docs/AWESOMENESS-SURFACE.md): what you walk
// *on*, as opposed to what you walk *through* (landcover, a later task). Pure and
// unit-tested; needs no new data — `highway` is already on every edge.

import { MIN_RANK_LENGTH_M } from "./fajturista.ts";

/** The three underfoot tiers, best → worst to walk. */
export type SurfaceClass = "trail" | "paved" | "road";

// Natural / unpaved ways — the good stuff (~67% of km in the region).
const TRAIL = new Set(["track", "path", "footway", "steps", "cycleway", "bridleway"]);
// Quiet settlement paving — sidewalks, drives, village streets (~27%).
const PAVED = new Set(["residential", "living_street", "pedestrian", "service", "unclassified"]);
// Classified motor roads carrying traffic — the least pleasant underfoot (~6%).
const ROAD = new Set(["secondary", "tertiary", "primary", "trunk"]);

/**
 * Classify a segment by what you walk on. An unknown or missing `highway` falls
 * back to `paved`: we can't vouch for it being a genuine trail, so it is neither
 * drawn at full emphasis nor offered as a "Vándor dob" seed.
 */
export function surfaceClass(highway?: string): SurfaceClass {
  if (highway) {
    if (TRAIL.has(highway)) return "trail";
    if (ROAD.has(highway)) return "road";
    if (PAVED.has(highway)) return "paved";
  }
  return "paved";
}

/**
 * The pool the dice may seed a túra from: natural `trail` segments at least
 * `minLengthM` long. The surface filter keeps the roll off settlement streets and
 * motor roads (T10a); the length floor (FN2) keeps it off micro-connectors — the
 * sub-50 m crossing stubs we now keep in the graph for routing accuracy, and any
 * other stubby fragment — so "Vándor dob" always lands on a segment worth walking.
 * Reuses the faj-turista's `MIN_RANK_LENGTH_M` (a short segment can't earn a crown,
 * and shouldn't be offered as a whole túra either). Pure; the per-lens strategies in
 * main.ts narrow this pool further, but never below this floor.
 */
export function rollableSeeds<T extends { highway?: string; lengthM: number }>(
  edges: T[],
  minLengthM: number = MIN_RANK_LENGTH_M,
): T[] {
  return edges.filter(
    (e) => surfaceClass(e.highway) === "trail" && e.lengthM >= minLengthM,
  );
}

/**
 * Length-weighted fraction (0..1) of a walk that is natural `trail` — the "89% 🥾"
 * signal in the túra overview. Pass the traversed segments (a doubled spur counts
 * for both legs); empty input → 0.
 */
export function trailFraction(segments: { highway?: string; lengthM: number }[]): number {
  let total = 0;
  let trail = 0;
  for (const s of segments) {
    total += s.lengthM;
    if (surfaceClass(s.highway) === "trail") trail += s.lengthM;
  }
  return total === 0 ? 0 : trail / total;
}
