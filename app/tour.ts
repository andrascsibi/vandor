// Pure model for a *túra* (T7): an implicitly-ordered collection of segments the
// user assembles by clicking. No DOM, no Leaflet — unit-testable. The app holds
// the túra as an ordered list of edge ids (insertion order); these helpers do
// membership, totals, and ordering the segments into a walking sequence for the
// Mapy link + to find the túra's open ends.
import { haversine, type Edge, type Vertex } from "../graph/graph.ts";

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

/**
 * Walking distance of the túra, metres: every segment once, plus once more for a
 * spur you must retrace — a segment touching a genuine dead end (a summit or
 * trail terminus you walk out to and back, "oda-vissza"). `retraceVertices` is
 * the set of such dead-end vertices (interior degree-1 vertices; map-boundary
 * stubs are excluded upstream, since there the trail only leaves our view). Equal
 * to `totalLengthM` when the túra has no spur.
 */
export function tourWalkingLengthM(
  ids: number[],
  byId: Map<number, Edge>,
  retraceVertices: Set<number>,
): number {
  let sum = 0;
  for (const id of ids) {
    const e = byId.get(id);
    if (!e) continue;
    sum += e.lengthM;
    if (retraceVertices.has(e.from) || retraceVertices.has(e.to)) sum += e.lengthM;
  }
  return sum;
}

/** True if the segment touches a dead end you must retrace (an out-and-back spur). */
export function isRetraceSpur(
  id: number,
  byId: Map<number, Edge>,
  retraceVertices: Set<number>,
): boolean {
  const e = byId.get(id);
  return !!e && (retraceVertices.has(e.from) || retraceVertices.has(e.to));
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

interface Link {
  edgeId: number;
  other: number;
}

/**
 * Order the túra's segments into a walking sequence and return the ordered
 * endpoint-vertex coordinates (the junctions Mapy routes through). Greedy chain:
 * start at an open end (a vertex used by exactly one túra segment) if there is
 * one, else any vertex; follow unused segments, sharing vertices. When a walk
 * dead-ends with segments left (a disconnected or branching túra), it jumps to
 * a remaining segment — Mapy will route across the gap.
 *
 * `preferredStart` (the chosen parking, when there is one) biases the start: the
 * chain begins at the open end nearest the car, so Mapy flows park → near end →
 * through the túra → far end → back, instead of park → middle → back-and-forth.
 */
export function orderedWaypoints(
  ids: number[],
  byId: Map<number, Edge>,
  vById: Map<number, Vertex>,
  preferredStart?: Point,
): Point[] {
  const edges = ids.map((id) => byId.get(id)).filter((e): e is Edge => !!e && e.from !== e.to);
  if (edges.length === 0) return [];

  const adj = new Map<number, Link[]>();
  const addLink = (v: number, link: Link) => {
    const list = adj.get(v);
    if (list) list.push(link);
    else adj.set(v, [link]);
  };
  for (const e of edges) {
    addLink(e.from, { edgeId: e.id, other: e.to });
    addLink(e.to, { edgeId: e.id, other: e.from });
  }

  const coord = (v: number): Point => {
    const vx = vById.get(v)!;
    return [vx.lon, vx.lat];
  };

  // Choose the chain's start. The candidate starts are the open ends (vertices
  // used by exactly one túra segment); if there are none (a closed loop) any
  // vertex will do. With a preferred start (the chosen parking) pick the
  // candidate nearest it, so the route leaves from the end closest to the car.
  const openEnds: number[] = [];
  for (const [v, links] of adj) if (links.length === 1) openEnds.push(v);
  const candidates = openEnds.length ? openEnds : [...adj.keys()];
  let start = candidates[0] ?? edges[0].from;
  if (preferredStart) {
    let best = Infinity;
    for (const v of candidates) {
      const d = haversine(coord(v), preferredStart);
      if (d < best) {
        best = d;
        start = v;
      }
    }
  }
  const usedEdges = new Set<number>();
  const out: Point[] = [coord(start)];
  let cur = start;

  while (usedEdges.size < edges.length) {
    const next = adj.get(cur)?.find((l) => !usedEdges.has(l.edgeId));
    if (next) {
      usedEdges.add(next.edgeId);
      cur = next.other;
      out.push(coord(cur));
    } else {
      // Dead end with segments left: jump to a remaining segment.
      const left = edges.find((e) => !usedEdges.has(e.id))!;
      usedEdges.add(left.id);
      out.push(coord(left.from));
      cur = left.to;
      out.push(coord(cur));
    }
  }
  return out;
}
