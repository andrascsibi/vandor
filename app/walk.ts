// The walking engine (T7 → "az út a cél"). A *túra* is a set of segments; how you
// actually walk it is derived here. The governing idea: with a car you must come
// back to where you parked, so a túra is a **closed walk** that returns to its
// start vertex. Which segments get walked twice is therefore a property of the
// *túra subgraph* — its odd-degree vertices — not of the whole network: closing an
// open end means retracing, and the minimal retrace is the Chinese-Postman T-join
// over the odd vertices. A doubled segment shows up as two steps (the return one
// flagged), which is the only honest way to render a figure-8 / dumbbell túra where
// the shared middle is walked twice, non-adjacently.
//
// Without a chosen parking we don't know where the loop must close, so we fall back
// to a plain linear chain (no duplication) — that also keeps "Vándor dob" on a
// single segment from weirdly doubling it. Pure, offline, unit-testable.
import { haversine, type Edge, type Vertex } from "../graph/graph.ts";
import { buildRouteGraph, shortestPath, tourComponents } from "./router.ts";
import type { Point } from "./tour.ts";

/** One traversal of a segment in walking order. `reversed` = walked to→from. */
export interface WalkStep {
  id: number;
  reversed: boolean;
}

export interface TourWalk {
  /** Segments in walking order; a doubled segment appears twice. */
  steps: WalkStep[];
  /** Vertex coordinates along the walk — the Mapy waypoints. */
  coords: Point[];
  /** True walking distance, metres (repeated segments counted each time). */
  lengthM: number;
  /** True when the walk returns to its start vertex (first coord === last). */
  closed: boolean;
}

/** Distinct, routable túra edges in insertion order (self-loops/unknowns dropped). */
function tourEdges(ids: number[], byId: Map<number, Edge>): Edge[] {
  const seen = new Set<number>();
  const out: Edge[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = byId.get(id);
    if (e && e.from !== e.to) out.push(e);
  }
  return out;
}

const coordOf = (vById: Map<number, Vertex>, v: number): Point => {
  const vx = vById.get(v)!;
  return [vx.lon, vx.lat];
};

/** Degree of each vertex within the túra subgraph (self-loops already excluded). */
function subgraphDegrees(edges: Edge[]): Map<number, number> {
  const deg = new Map<number, number>();
  for (const e of edges) {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }
  return deg;
}

/** The subgraph vertex nearest `p` (euclidean-ish haversine), or a fallback. */
function nearestVertex(edges: Edge[], vById: Map<number, Vertex>, p: Point, fallback: number): number {
  let best = fallback;
  let bestD = Infinity;
  const seen = new Set<number>();
  for (const e of edges) {
    for (const v of [e.from, e.to]) {
      if (seen.has(v)) continue;
      seen.add(v);
      const d = haversine(coordOf(vById, v), p);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
  }
  return best;
}

/**
 * Minimum-weight perfect matching of the odd-degree vertices, paths restricted to
 * the túra's own edges — the Chinese-Postman T-join. The segments that must be
 * doubled are the symmetric difference (XOR) of the matched shortest paths' edges.
 * For a lone spur this is just the spur; for a dumbbell, the connecting path. Exact
 * via subset DP for the handful of odd vertices a real túra has; greedy above a
 * guard so a pathological túra can't blow up.
 */
function tJoinEdges(edges: Edge[], odd: number[]): Set<number> {
  const doubled = new Set<number>();
  if (odd.length < 2) return doubled;
  const g = buildRouteGraph(edges);
  const n = odd.length;
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  const pathEdges: number[][][] = Array.from({ length: n }, () => new Array(n).fill(null));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const p = shortestPath(g, [odd[i]], new Set([odd[j]]));
      dist[i][j] = dist[j][i] = p ? p.distM : Infinity;
      pathEdges[i][j] = pathEdges[j][i] = p ? p.edgeIds : [];
    }
  }

  let pairs: [number, number][];
  if (n <= 16) {
    // Subset DP over the matched-vertex set: pair the lowest unmatched vertex with
    // each other unmatched one. Track the predecessor + pair so we can reconstruct.
    const SIZE = 1 << n;
    const dp = new Array<number>(SIZE).fill(Infinity);
    const par = new Array<number>(SIZE).fill(0);
    const pi = new Array<number>(SIZE).fill(-1);
    const pj = new Array<number>(SIZE).fill(-1);
    dp[0] = 0;
    for (let mask = 0; mask < SIZE; mask++) {
      if (dp[mask] === Infinity || mask === SIZE - 1) continue;
      let i = 0;
      while (mask & (1 << i)) i++;
      for (let j = i + 1; j < n; j++) {
        if (mask & (1 << j)) continue;
        const nm = mask | (1 << i) | (1 << j);
        const cost = dp[mask] + dist[i][j];
        if (cost < dp[nm]) {
          dp[nm] = cost;
          par[nm] = mask;
          pi[nm] = i;
          pj[nm] = j;
        }
      }
    }
    pairs = [];
    for (let mask = SIZE - 1; mask > 0; mask = par[mask]) pairs.push([pi[mask], pj[mask]]);
  } else {
    // Greedy fallback: repeatedly take the globally cheapest remaining pair.
    const used = new Array<boolean>(n).fill(false);
    pairs = [];
    for (let k = 0; k < n / 2; k++) {
      let bi = -1;
      let bj = -1;
      let bd = Infinity;
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        for (let j = i + 1; j < n; j++) {
          if (used[j]) continue;
          if (dist[i][j] < bd) {
            bd = dist[i][j];
            bi = i;
            bj = j;
          }
        }
      }
      if (bi < 0) break;
      used[bi] = used[bj] = true;
      pairs.push([bi, bj]);
    }
  }

  for (const [i, j] of pairs) {
    for (const eid of pathEdges[i][j] ?? []) {
      if (doubled.has(eid)) doubled.delete(eid);
      else doubled.add(eid);
    }
  }
  return doubled;
}

/** An Euler-circuit arc instance: a physical edge-copy, used once from either end. */
interface Arc {
  to: number;
  edgeId: number;
  twin: Arc;
  used: boolean;
}

/**
 * Hierholzer's algorithm over a connected, all-even multigraph: an Euler circuit
 * from `start`, as the traversed edges in order (with the direction each was walked).
 */
function eulerCircuit(
  start: number,
  edges: Edge[],
  doubled: Set<number>,
): { edgeId: number; from: number; to: number }[] {
  const adj = new Map<number, Arc[]>();
  const push = (v: number, arc: Arc) => {
    const list = adj.get(v);
    if (list) list.push(arc);
    else adj.set(v, [arc]);
  };
  const addEdge = (e: Edge) => {
    const a = { to: e.to, edgeId: e.id, used: false } as Arc;
    const b = { to: e.from, edgeId: e.id, used: false } as Arc;
    a.twin = b;
    b.twin = a;
    push(e.from, a);
    push(e.to, b);
  };
  for (const e of edges) {
    addEdge(e);
    if (doubled.has(e.id)) addEdge(e);
  }

  const ptr = new Map<number, number>();
  const vstack: number[] = [start];
  const estack: { edgeId: number; from: number; to: number }[] = [];
  const result: { edgeId: number; from: number; to: number }[] = [];
  while (vstack.length) {
    const v = vstack[vstack.length - 1];
    const arcs = adj.get(v) ?? [];
    let i = ptr.get(v) ?? 0;
    while (i < arcs.length && arcs[i].used) i++;
    ptr.set(v, i);
    if (i === arcs.length) {
      vstack.pop();
      const e = estack.pop();
      if (e) result.push(e);
    } else {
      const arc = arcs[i];
      arc.used = true;
      arc.twin.used = true;
      ptr.set(v, i + 1);
      vstack.push(arc.to);
      estack.push({ edgeId: arc.edgeId, from: v, to: arc.to });
    }
  }
  result.reverse();
  return result;
}

/** A plain linear chain through the segments (no duplication): the open walk. */
function linearWalk(edges: Edge[], vById: Map<number, Vertex>, start?: Point): TourWalk {
  if (edges.length === 0) return { steps: [], coords: [], lengthM: 0, closed: false };
  const byId = new Map(edges.map((e) => [e.id, e]));
  const adj = new Map<number, { edgeId: number; other: number }[]>();
  const add = (v: number, l: { edgeId: number; other: number }) => {
    const list = adj.get(v);
    if (list) list.push(l);
    else adj.set(v, [l]);
  };
  for (const e of edges) {
    add(e.from, { edgeId: e.id, other: e.to });
    add(e.to, { edgeId: e.id, other: e.from });
  }
  // Start at an open end (used by one segment) if there is one, else any vertex;
  // with a preferred start pick the candidate nearest it.
  const openEnds: number[] = [];
  for (const [v, links] of adj) if (links.length === 1) openEnds.push(v);
  const candidates = openEnds.length ? openEnds : [...adj.keys()];
  let startV = candidates[0] ?? edges[0].from;
  if (start) {
    let bestD = Infinity;
    for (const v of candidates) {
      const d = haversine(coordOf(vById, v), start);
      if (d < bestD) {
        bestD = d;
        startV = v;
      }
    }
  }

  const used = new Set<number>();
  const steps: WalkStep[] = [];
  const coords: Point[] = [coordOf(vById, startV)];
  let lengthM = 0;
  let cur = startV;
  while (used.size < edges.length) {
    const next = adj.get(cur)?.find((l) => !used.has(l.edgeId));
    if (next) {
      used.add(next.edgeId);
      const e = byId.get(next.edgeId)!;
      steps.push({ id: e.id, reversed: cur === e.to });
      lengthM += e.lengthM;
      cur = next.other;
      coords.push(coordOf(vById, cur));
    } else {
      // Dead end with segments left (disconnected túra): jump the gap.
      const left = edges.find((e) => !used.has(e.id))!;
      used.add(left.id);
      steps.push({ id: left.id, reversed: false });
      lengthM += left.lengthM;
      coords.push(coordOf(vById, left.from));
      cur = left.to;
      coords.push(coordOf(vById, cur));
    }
  }
  return { steps, coords, lengthM, closed: false };
}

/**
 * Plan how the túra is walked. Without `close` (no parking chosen) it's a linear
 * chain, one row per segment. With `close` (a parking fixes start = end) it's a
 * closed walk from the túra vertex nearest the car, doubling whatever must be
 * retraced to get back — unless the túra is in several pieces, where closing is
 * meaningless and we fall back to the linear chain.
 */
export function planWalk(
  ids: number[],
  byId: Map<number, Edge>,
  vById: Map<number, Vertex>,
  opts: { start?: Point; close?: boolean } = {},
): TourWalk {
  const edges = tourEdges(ids, byId);
  if (edges.length === 0) return { steps: [], coords: [], lengthM: 0, closed: false };
  if (!opts.close) return linearWalk(edges, vById, opts.start);

  if (tourComponents(edges.map((e) => e.id), byId).length > 1) {
    return linearWalk(edges, vById, opts.start);
  }

  const startV = opts.start ? nearestVertex(edges, vById, opts.start, edges[0].from) : edges[0].from;
  const deg = subgraphDegrees(edges);
  const odd: number[] = [];
  for (const [v, d] of deg) if (d % 2 === 1) odd.push(v);
  const doubled = tJoinEdges(edges, odd);

  const circuit = eulerCircuit(startV, edges, doubled);
  const byIdLocal = new Map(edges.map((e) => [e.id, e]));
  const steps: WalkStep[] = [];
  const coords: Point[] = [coordOf(vById, startV)];
  let lengthM = 0;
  for (const t of circuit) {
    const e = byIdLocal.get(t.edgeId)!;
    steps.push({ id: t.edgeId, reversed: t.from === e.to });
    lengthM += e.lengthM;
    coords.push(coordOf(vById, t.to));
  }
  const closed = coords.length > 1 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1];
  return { steps, coords, lengthM, closed };
}
