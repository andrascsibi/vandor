// A small shortest-path router over the segment graph (the proto-planner). Pure,
// offline, unit-testable — no DOM, no Leaflet. Two public jobs, both built on one
// Dijkstra:
//
//   • fillTourGaps  — stitch a disconnected túra into one piece by routing the
//     missing trail between its components.
//   • closeTourLoop — route a túra's open ends back together over the rest of the
//     network, touching each selected segment at most once ("járt utat járatlanért").
//
// Dead ends (degree-1 vertices: summits, spur tips, map-boundary stubs) are never
// *passed through* by a shortest path — there's no second edge to leave by — so the
// router ignores them for free. They matter only as out-and-back spurs you must
// retrace, handled by the walking-distance double-count in tour.ts.
import { type Edge } from "../graph/graph.ts";

export interface RouteLink {
  edgeId: number;
  /** The vertex at the other end of this edge. */
  other: number;
  lengthM: number;
}

/** Adjacency: vertex id → the segments leaving it. */
export type RouteGraph = Map<number, RouteLink[]>;

/** Build the routing adjacency from the full edge list (self-loops skipped). */
export function buildRouteGraph(edges: Edge[]): RouteGraph {
  const g: RouteGraph = new Map();
  const add = (v: number, link: RouteLink) => {
    const list = g.get(v);
    if (list) list.push(link);
    else g.set(v, [link]);
  };
  for (const e of edges) {
    if (e.from === e.to) continue;
    add(e.from, { edgeId: e.id, other: e.to, lengthM: e.lengthM });
    add(e.to, { edgeId: e.id, other: e.from, lengthM: e.lengthM });
  }
  return g;
}

/** How many segments touch each vertex, across the whole edge list. */
export function vertexDegrees(edges: Edge[]): Map<number, number> {
  const deg = new Map<number, number>();
  for (const e of edges) {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }
  return deg;
}

/** Network dead ends: vertices with exactly one incident segment. */
export function deadEndVertices(edges: Edge[]): Set<number> {
  const out = new Set<number>();
  for (const [v, d] of vertexDegrees(edges)) if (d === 1) out.add(v);
  return out;
}

export interface PathResult {
  /** The segments walked, in order from a source toward the reached target. */
  edgeIds: number[];
  /** The vertices along the path, source first, reached target last. */
  vertices: number[];
  distM: number;
}

/**
 * Dijkstra from any of `sources` (all at distance 0) to the nearest vertex in
 * `targets`, over `g`, optionally forbidding some edges (`excludeEdges` — used to
 * keep a loop off its own segments). Returns the path (empty when a source is
 * already a target), or null when no target is reachable. The graph is ~800
 * vertices, so a linear-scan frontier is plenty.
 */
export function shortestPath(
  g: RouteGraph,
  sources: Iterable<number>,
  targets: Set<number>,
  opts: { excludeEdges?: Set<number> } = {},
): PathResult | null {
  const exclude = opts.excludeEdges;
  const dist = new Map<number, number>();
  const prev = new Map<number, { v: number; edgeId: number }>();
  const visited = new Set<number>();
  for (const s of sources) if (!dist.has(s)) dist.set(s, 0);
  if (dist.size === 0 || targets.size === 0) return null;

  for (;;) {
    // Extract the unvisited vertex with the smallest tentative distance.
    let u = -1;
    let best = Infinity;
    for (const [v, dv] of dist) {
      if (!visited.has(v) && dv < best) {
        best = dv;
        u = v;
      }
    }
    if (u === -1) break;
    visited.add(u);

    if (targets.has(u)) {
      const vertices = [u];
      const edgeIds: number[] = [];
      let cur = u;
      while (prev.has(cur)) {
        const p = prev.get(cur)!;
        edgeIds.push(p.edgeId);
        vertices.push(p.v);
        cur = p.v;
      }
      vertices.reverse();
      edgeIds.reverse();
      return { edgeIds, vertices, distM: best };
    }

    for (const link of g.get(u) ?? []) {
      if (exclude?.has(link.edgeId)) continue;
      const nd = best + link.lengthM;
      if (nd < (dist.get(link.other) ?? Infinity)) {
        dist.set(link.other, nd);
        prev.set(link.other, { v: u, edgeId: link.edgeId });
      }
    }
  }
  return null;
}

/** The distinct vertices touched by a set of segments. */
function verticesOf(ids: number[], byId: Map<number, Edge>): number[] {
  const s = new Set<number>();
  for (const id of ids) {
    const e = byId.get(id);
    if (e) {
      s.add(e.from);
      s.add(e.to);
    }
  }
  return [...s];
}

/**
 * The túra's open ends: vertices touched by exactly one túra segment. A simple
 * chain has two; a closed loop has none; a branching/forked túra has more.
 */
export function tourOpenEnds(ids: number[], byId: Map<number, Edge>): number[] {
  const deg = new Map<number, number>();
  for (const id of ids) {
    const e = byId.get(id);
    if (!e || e.from === e.to) continue;
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }
  const out: number[] = [];
  for (const [v, d] of deg) if (d === 1) out.push(v);
  return out;
}

/**
 * Connected components of the túra, as groups of edge ids joined by shared
 * vertices. One group → the túra is continuous; more → it has gaps. Insertion
 * order of `ids` is preserved within and across groups (stable, testable).
 */
export function tourComponents(ids: number[], byId: Map<number, Edge>): number[][] {
  const present = ids.filter((id) => byId.has(id));
  const parent = new Map<number, number>();
  for (const id of present) parent.set(id, id);
  const find = (x: number): number => {
    let root = x;
    while (parent.get(root)! !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur)! !== root) {
      const nxt = parent.get(cur)!;
      parent.set(cur, root);
      cur = nxt;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  const byVertex = new Map<number, number>(); // first edge seen at a vertex
  for (const id of present) {
    const e = byId.get(id)!;
    for (const v of [e.from, e.to]) {
      const seen = byVertex.get(v);
      if (seen === undefined) byVertex.set(v, id);
      else union(seen, id);
    }
  }
  const comps = new Map<number, number[]>();
  for (const id of present) {
    const r = find(id);
    const list = comps.get(r);
    if (list) list.push(id);
    else comps.set(r, [id]);
  }
  return [...comps.values()];
}

/**
 * Connector segment ids that stitch a disconnected túra into one piece: route
 * the shortest trail from the growing main component to the nearest remaining
 * component, repeatedly, over the full graph. Returns the extra edge ids to add
 * (empty when the túra is already continuous; partial if some gap is unroutable).
 */
export function fillTourGaps(
  ids: number[],
  byId: Map<number, Edge>,
  g: RouteGraph,
): number[] {
  const comps = tourComponents(ids, byId);
  if (comps.length <= 1) return [];
  const inTour = new Set(ids);
  const added: number[] = [];
  const base = new Set<number>(verticesOf(comps[0], byId));
  let rest = comps.slice(1);

  while (rest.length) {
    const targetVerts = new Set<number>();
    const ownerOf = new Map<number, number>();
    rest.forEach((comp, i) => {
      for (const v of verticesOf(comp, byId)) {
        targetVerts.add(v);
        ownerOf.set(v, i);
      }
    });
    const path = shortestPath(g, base, targetVerts);
    if (!path) break;
    for (const eid of path.edgeIds) {
      if (!inTour.has(eid)) {
        inTour.add(eid);
        added.push(eid);
      }
    }
    for (const v of path.vertices) base.add(v);
    const reached = ownerOf.get(path.vertices[path.vertices.length - 1])!;
    for (const v of verticesOf(rest[reached], byId)) base.add(v);
    rest = rest.filter((_, i) => i !== reached);
  }
  return added;
}

/**
 * Connector segment ids that close the túra into a loop: route the shortest trail
 * between its open ends over the *rest* of the network (its own segments excluded,
 * so each is walked at most once). Dead-end open ends (summits/spurs) can't anchor
 * a loop — they're out-and-back — so they're skipped. A forked túra with several
 * open ends is closed greedily, cheapest pair first. Returns the extra edge ids to
 * add (empty when there's nothing to close, or no off-túra route exists).
 */
export function closeTourLoop(
  ids: number[],
  byId: Map<number, Edge>,
  g: RouteGraph,
  deadEnds: Set<number>,
): number[] {
  let working = [...ids];
  const added: number[] = [];

  for (;;) {
    const ends = tourOpenEnds(working, byId).filter((v) => !deadEnds.has(v));
    if (ends.length < 2) break;
    const exclude = new Set(working);
    let best: PathResult | null = null;
    for (let i = 0; i < ends.length; i++) {
      const others = new Set(ends.filter((_, j) => j !== i));
      const path = shortestPath(g, [ends[i]], others, { excludeEdges: exclude });
      if (path && path.edgeIds.length && (!best || path.distM < best.distM)) best = path;
    }
    if (!best) break;
    for (const eid of best.edgeIds) {
      working.push(eid);
      added.push(eid);
    }
  }
  return added;
}
