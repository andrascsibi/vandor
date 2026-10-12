// Pure model for a *túra* (T7): an implicitly-ordered collection of segments the
// user assembles by clicking. No DOM, no Leaflet — unit-testable. The app holds
// the túra as an ordered list of edge ids (insertion order); these helpers do
// membership, totals, and ordering the segments into a walking sequence for the
// Mapy link + to find the túra's open ends.
import type { Edge, Vertex } from "../graph/graph.ts";

/** [lon, lat] — the project's GeoJSON coordinate order. */
export type Point = [number, number];

/** Add the segment if absent, remove it if present (keeps insertion order). */
export function toggleSegment(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Summed length of the túra's segments, metres. */
export function totalLengthM(ids: number[], byId: Map<number, Edge>): number {
  let sum = 0;
  for (const id of ids) sum += byId.get(id)?.lengthM ?? 0;
  return sum;
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
 */
export function orderedWaypoints(
  ids: number[],
  byId: Map<number, Edge>,
  vById: Map<number, Vertex>,
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

  // Prefer an open end (degree 1) as the start, else the first segment's `from`.
  let start = edges[0].from;
  for (const [v, links] of adj) {
    if (links.length === 1) {
      start = v;
      break;
    }
  }

  const coord = (v: number): Point => {
    const vx = vById.get(v)!;
    return [vx.lon, vx.lat];
  };
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
