// Pure model for a *túra* (T7): a set of segments the user assembles by clicking,
// held as an insertion-ordered list of edge ids. No DOM, no Leaflet — unit-testable.
// These helpers do membership, totals, candidate parking, and hash round-tripping.
// How the set is actually *walked* (ordering + duplication) lives in `walk.ts`.
import { type Edge, type Vertex } from "../graph/graph.ts";

/** [lon, lat] — the project's GeoJSON coordinate order. */
export type Point = [number, number];

/** Add the segment if absent, remove it if present (keeps insertion order). */
export function toggleSegment(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Summed length of the túra's segments, metres (each counted once). */
export function totalLengthM(ids: number[], byId: Map<number, Edge>): number {
  let sum = 0;
  for (const id of ids) sum += byId.get(id)?.lengthM ?? 0;
  return sum;
}

/** A candidate parking for the túra (T7d): a lot + where to walk in from. */
export interface AccessCandidate {
  lon: number;
  lat: number;
  name?: string;
  /** Crow-flies distance from the nearest túra endpoint, metres. */
  distM: number;
  /** That nearest túra endpoint (where the dashed approach line starts). */
  fromLon: number;
  fromLat: number;
}

/**
 * The distinct candidate parking for a túra (T7d): each túra endpoint's nearest
 * usable parking, deduped by lot — keeping, for each lot, the closest túra
 * endpoint (its `from*` is where the approach line is drawn from). These are the
 * options the user picks a start from.
 */
export function tourAccessPoints(
  ids: number[],
  byId: Map<number, Edge>,
  vById: Map<number, Vertex>,
): AccessCandidate[] {
  const seenVertex = new Set<number>();
  const byLot = new Map<string, AccessCandidate>();
  for (const id of ids) {
    const e = byId.get(id);
    if (!e) continue;
    for (const vid of [e.from, e.to]) {
      if (seenVertex.has(vid)) continue;
      seenVertex.add(vid);
      const v = vById.get(vid);
      if (!v?.access) continue;
      const a = v.access;
      const key = `${a.lon},${a.lat}`;
      const prev = byLot.get(key);
      if (!prev || a.distM < prev.distM) {
        byLot.set(key, { lon: a.lon, lat: a.lat, name: a.name, distM: a.distM, fromLon: v.lon, fromLat: v.lat });
      }
    }
  }
  return [...byLot.values()];
}

/** Encode a túra as a URL hash body (no leading #): `t=1,2,3[&p=lon,lat]`. */
export function encodeTourHash(ids: number[], access: { lon: number; lat: number } | null): string {
  if (ids.length === 0) return "";
  let h = `t=${ids.join(",")}`;
  if (access) h += `&p=${access.lon},${access.lat}`;
  return h;
}

/** Parse a shared túra hash back into segment ids + an optional chosen parking. */
export function parseTourHash(hash: string): { ids: number[]; access: [number, number] | null } {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const t = params.get("t");
  const ids = t
    ? t.split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 0)
    : [];
  let access: [number, number] | null = null;
  const p = params.get("p");
  if (p) {
    const [lon, lat] = p.split(",").map(Number);
    if (Number.isFinite(lon) && Number.isFinite(lat)) access = [lon, lat];
  }
  return { ids, access };
}
