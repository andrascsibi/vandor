// Pure, offline graph builder (T2). Turns the ingested trail ways into a
// segment graph by edge contraction:
//
//   1. Every OSM node that is NOT a simple pass-through becomes a vertex.
//      "Pass-through" = degree exactly 2 across the whole trail network
//      (interior of a single way, or two ways joined end to end). Dead ends
//      (degree 1) and junctions (degree >= 3) are vertices.
//   2. Each maximal chain of pass-through nodes between two vertices contracts
//      into one segment (edge), carrying the full polyline. Chains can span
//      multiple ways joined end to end.
//   3. 50m merge rule: endpoints of a sub-50m edge are merged into one vertex
//      (de-noises micro-junctions, e.g. a trail crossing a road). The collapsed
//      edge is dropped and remaining edges are re-contracted, so no degree-2
//      vertex survives the merge.
//
// No filesystem, no DOM — build-segments.ts does the IO so this stays testable.

import type { TrailFeatureCollection } from "../ingest/overpass.ts";

export const MERGE_THRESHOLD_M = 50;

export interface Vertex {
  /** Compact 0-based index (the id edges reference). */
  id: number;
  /** OSM node id of the vertex (cluster representative after merging). */
  osmId: number;
  lon: number;
  lat: number;
}

export interface Edge {
  id: number;
  /** Vertex index. */
  from: number;
  /** Vertex index. */
  to: number;
  /** Haversine length of the polyline, metres (1 decimal). */
  lengthM: number;
  /** Full polyline, [lon, lat] pairs, from the `from` end to the `to` end. */
  coordinates: [number, number][];
  /** Distinct OSM way ids this segment is built from. */
  ways: number[];
  /** Distinct waymark colours of the route(s) along this segment (e.g. "blue"). */
  colours: string[];
  /** Distinct Hungarian mark codes along this segment (e.g. "K↺", "OKT"). */
  markings: string[];
  /** First trail name encountered along the segment, if any. */
  name?: string;
  /** First highway tag encountered along the segment. */
  highway?: string;
}

export interface SegmentGraph {
  vertices: Vertex[];
  edges: Edge[];
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two [lon, lat] points, in metres. */
export function haversine(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/** Summed haversine length of a polyline, in metres. */
function polylineLength(coords: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i + 1 < coords.length; i++) sum += haversine(coords[i], coords[i + 1]);
  return sum;
}

// An edge keyed by OSM node ids, before compacting to vertex indices. This is
// the unit both the first (per-link) and second (post-merge) contraction pass
// operate on.
interface RawEdge {
  from: number;
  to: number;
  coordinates: [number, number][];
  ways: number[];
  colours: string[];
  markings: string[];
  name?: string;
  highway?: string;
}

/**
 * Contract degree-2 chains in an edge list. Any vertex with exactly two
 * incident non-self-loop edges is a pass-through; its two edges are spliced
 * into one. Dead ends, junctions and self-loop vertices are kept. Works both
 * on per-link edges (first pass) and on already-contracted edges (second pass
 * after the 50m merge).
 */
function contractChains(edges: RawEdge[]): RawEdge[] {
  interface Ref {
    edge: number;
    /** true if this vertex is the edge's `from` end. */
    atFrom: boolean;
  }
  const inc = new Map<number, Ref[]>();
  const add = (node: number, ref: Ref) => {
    const list = inc.get(node);
    if (list) list.push(ref);
    else inc.set(node, [ref]);
  };
  edges.forEach((e, i) => {
    add(e.from, { edge: i, atFrom: true });
    add(e.to, { edge: i, atFrom: false });
  });

  const isThrough = (node: number): boolean => {
    const list = inc.get(node);
    if (!list || list.length !== 2) return false;
    if (list[0].edge === list[1].edge) return false; // self-loop or lollipop → keep
    const e0 = edges[list[0].edge];
    const e1 = edges[list[1].edge];
    if (e0.from === e0.to || e1.from === e1.to) return false; // self-loop → keep
    return true;
  };

  const used = new Set<number>();

  // Walk a chain starting from `start` along edge `startEdge`, splicing through
  // pass-through vertices until the next kept vertex (or back to start).
  const walk = (start: number, startEdge: number): RawEdge => {
    const coordinates: [number, number][] = [];
    const ways = new Set<number>();
    const colours = new Set<string>();
    const markings = new Set<string>();
    let name: string | undefined;
    let highway: string | undefined;
    let cur = start;
    let ei = startEdge;
    let first = true;

    for (;;) {
      used.add(ei);
      const e = edges[ei];
      for (const w of e.ways) ways.add(w);
      for (const c of e.colours) colours.add(c);
      for (const m of e.markings) markings.add(m);
      name ??= e.name;
      highway ??= e.highway;

      // Orient the edge so we traverse it leaving `cur`.
      const leaving = e.from === cur;
      const segCoords = leaving ? e.coordinates : [...e.coordinates].reverse();
      const exit = leaving ? e.to : e.from;
      if (first) {
        coordinates.push(...segCoords);
        first = false;
      } else {
        coordinates.push(...segCoords.slice(1)); // shared vertex already present
      }

      if (!isThrough(exit) || exit === start) {
        return {
          from: start,
          to: exit,
          coordinates,
          ways: [...ways],
          colours: [...colours].sort(),
          markings: [...markings].sort(),
          name,
          highway,
        };
      }
      const list = inc.get(exit)!;
      const next = list[0].edge === ei ? list[1] : list[0];
      if (used.has(next.edge)) {
        return {
          from: start,
          to: exit,
          coordinates,
          ways: [...ways],
          colours: [...colours].sort(),
          markings: [...markings].sort(),
          name,
          highway,
        };
      }
      cur = exit;
      ei = next.edge;
    }
  };

  const out: RawEdge[] = [];
  // Pass A: from kept (non-through) vertices.
  for (const [node, list] of inc) {
    if (isThrough(node)) continue;
    for (const ref of list) if (!used.has(ref.edge)) out.push(walk(node, ref.edge));
  }
  // Pass B: leftover edges form all-through cycles; force a start vertex.
  for (const [node, list] of inc) {
    for (const ref of list) if (!used.has(ref.edge)) out.push(walk(node, ref.edge));
  }
  return out;
}

export function buildSegmentGraph(
  fc: TrailFeatureCollection,
  opts: { mergeThresholdM?: number } = {},
): SegmentGraph {
  const mergeThresholdM = opts.mergeThresholdM ?? MERGE_THRESHOLD_M;

  // 1. One RawEdge per consecutive OSM node pair (a single polyline link).
  const coord = new Map<number, [number, number]>();
  const linkEdges: RawEdge[] = [];
  for (const f of fc.features) {
    const nodes = f.properties.nodes;
    const coords = f.geometry.coordinates;
    const wayId = f.properties.osmid;
    const name = typeof f.properties.name === "string" ? f.properties.name : undefined;
    const highway =
      typeof f.properties.highway === "string" ? f.properties.highway : undefined;
    const colours = f.properties.colours ?? [];
    const markings = f.properties.markings ?? [];

    for (let i = 0; i < nodes.length; i++) coord.set(nodes[i], coords[i]);
    for (let i = 0; i + 1 < nodes.length; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      if (a === b) continue; // skip degenerate zero-length link
      linkEdges.push({
        from: a,
        to: b,
        coordinates: [coords[i], coords[i + 1]],
        ways: [wayId],
        colours,
        markings,
        name,
        highway,
      });
    }
  }

  // 2. Contract pass-through chains into maximal segments.
  let working = contractChains(linkEdges);

  // 3. 50m merge, iterated to a fixpoint: union the endpoints of every
  //    sub-threshold edge, remap to cluster reps (snapping the terminal coord
  //    so the polyline stays connected), drop any edge whose distinct endpoints
  //    collapsed, then re-contract. Snapping can shorten a neighbouring edge
  //    below the threshold, so we repeat until a round unions nothing. Each
  //    round removes at least one vertex, so this terminates.
  for (;;) {
    const parent = new Map<number, number>();
    for (const e of working) {
      if (!parent.has(e.from)) parent.set(e.from, e.from);
      if (!parent.has(e.to)) parent.set(e.to, e.to);
    }
    const find = (x: number): number => {
      let root = x;
      while ((parent.get(root) ?? root) !== root) root = parent.get(root)!;
      let cur = x;
      while ((parent.get(cur) ?? cur) !== cur) {
        const nxt = parent.get(cur)!;
        parent.set(cur, root);
        cur = nxt;
      }
      return root;
    };
    let didUnion = false;
    const union = (x: number, y: number) => {
      const rx = find(x);
      const ry = find(y);
      if (rx === ry) return;
      if (rx < ry) parent.set(ry, rx); // smaller osm id wins → deterministic rep
      else parent.set(rx, ry);
      didUnion = true;
    };
    for (const e of working) {
      if (e.from !== e.to && polylineLength(e.coordinates) < mergeThresholdM) {
        union(e.from, e.to);
      }
    }
    if (!didUnion) break;

    const remapped: RawEdge[] = [];
    for (const e of working) {
      const from = find(e.from);
      const to = find(e.to);
      if (from === to && e.from !== e.to) continue; // distinct ends collapsed → drop
      const coordinates = [...e.coordinates];
      if (from !== e.from) coordinates[0] = coord.get(from)!;
      if (to !== e.to) coordinates[coordinates.length - 1] = coord.get(to)!;
      remapped.push({ ...e, from, to, coordinates });
    }
    // Re-contract: the merge can leave degree-2 vertices; collapse them too.
    working = contractChains(remapped);
  }
  const finalEdges = working;

  // 5. Compact vertex indexing (first-seen order over the final edges).
  const index = new Map<number, number>();
  const vertices: Vertex[] = [];
  const vertexIndex = (osmId: number): number => {
    let idx = index.get(osmId);
    if (idx === undefined) {
      idx = vertices.length;
      index.set(osmId, idx);
      const c = coord.get(osmId)!;
      vertices.push({ id: idx, osmId, lon: c[0], lat: c[1] });
    }
    return idx;
  };

  const edges: Edge[] = finalEdges.map((e, id) => {
    const edge: Edge = {
      id,
      from: vertexIndex(e.from),
      to: vertexIndex(e.to),
      lengthM: Math.round(polylineLength(e.coordinates) * 10) / 10,
      coordinates: e.coordinates,
      ways: e.ways,
      colours: e.colours,
      markings: e.markings,
    };
    if (e.name !== undefined) edge.name = e.name;
    if (e.highway !== undefined) edge.highway = e.highway;
    return edge;
  });

  return { vertices, edges };
}
