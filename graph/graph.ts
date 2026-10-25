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
// A trail dead-end sitting within this of another trail vertex is treated as the
// same junction split across a road crossing (OSM ways not sharing a node), and
// merged — see the bridge pass in buildSegmentGraph.
export const BRIDGE_THRESHOLD_M = 20;

/** Nearest car access point to a vertex (T6): a parking POI, crow-flies. */
export interface AccessPoint {
  lon: number;
  lat: number;
  name?: string;
  /** Crow-flies distance from the vertex to this parking, metres (rounded). */
  distM: number;
}

export interface Vertex {
  /** Compact 0-based index (the id edges reference). */
  id: number;
  /** OSM node id of the vertex (cluster representative; <0 for POI-split vertices). */
  osmId: number;
  lon: number;
  lat: number;
  /** Name of the POI attached here (T4b), e.g. "János-hegy". */
  name?: string;
  /** POI kind attached here, e.g. "peak" | "viewpoint" | "spring" (T4b). */
  poiKind?: string;
  /** Elevation in metres, if the attached POI carries one. */
  ele?: number;
  /** Nearest usable car-parking to this endpoint (T6), crow-flies. */
  access?: AccessPoint;
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
  /**
   * Stable, build-order-independent content key (see `edgeStableKey`). Unlike
   * `id` — a compact index reassigned on every rebuild — this survives re-ingest
   * as long as the underlying OSM ways + endpoints are unchanged, so the personal
   * walk profile can key on it without a re-ingest silently mislabelling history.
   */
  key: string;
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

/**
 * cyrb53 — a small, fast, well-distributed non-cryptographic string hash (public
 * domain). Returns a ~53-bit integer; we render it base36 for a compact key.
 * Pure and dependency-free, so the stable key is identical in Node (build) and
 * the browser (load).
 */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Order-independent identity token for one edge endpoint. A real OSM node uses
 * its node id (`n<id>`); a synthetic POI-split vertex (osmId < 0 — a build-order
 * index, not a real node) falls back to rounded coordinates (`@lon,lat`), which
 * reproduce deterministically across rebuilds from the same POI + polyline.
 */
export function endpointToken(osmId: number, lon: number, lat: number): string {
  return osmId >= 0 ? `n${osmId}` : `@${lon.toFixed(6)},${lat.toFixed(6)}`;
}

/**
 * A stable, build-order-independent content key for an edge: a hash of its
 * sorted constituent OSM way ids plus its two endpoint tokens (also sorted, so
 * the from/to orientation can't change it). Survives re-ingest while the
 * underlying OSM ways + endpoints are unchanged; an OSM edit that splits/merges
 * a constituent way changes the key for those edges — graceful, self-healing
 * drift (they just read as unwalked again). The walk profile keys on THIS, never
 * on the compact `id` index, so a re-ingest can't silently mislabel history.
 */
export function edgeStableKey(ways: number[], tokenA: string, tokenB: string): string {
  const w = [...ways].sort((a, b) => a - b).join(",");
  const ends = [tokenA, tokenB].sort().join(",");
  return cyrb53(`${w}|${ends}`).toString(36);
}

/**
 * A direction-independent fingerprint of a polyline: hashes the rounded (~1 m)
 * coordinate sequence in whichever orientation sorts first, so a from/to flip on
 * rebuild can't change it. Used only to disambiguate the rare parallel edges that
 * share a base key.
 */
function geomFingerprint(coords: [number, number][]): string {
  const pts = coords.map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`);
  const fwd = pts.join(";");
  const rev = [...pts].reverse().join(";");
  return cyrb53(fwd < rev ? fwd : rev).toString(36);
}

/**
 * Disambiguate edges that share a base stable key — rare parallel arcs between
 * the same endpoints along the same ways (e.g. a loop out to a dead-end peak and
 * back, or two sides of a lollipop onto a POI-split vertex). Each colliding edge
 * gets a geometry fingerprint appended, so the key stays unique; the common case
 * (a base key used by just one edge) is left untouched and maximally stable.
 * Mutates `edges` in place. Call once on the final graph.
 */
export function dedupeEdgeKeys(edges: Edge[]): void {
  const groups = new Map<string, Edge[]>();
  for (const e of edges) {
    const g = groups.get(e.key);
    if (g) g.push(e);
    else groups.set(e.key, [e]);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    for (const e of g) e.key = `${e.key}~${geomFingerprint(e.coordinates)}`;
  }
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
  opts: { mergeThresholdM?: number; bridgeThresholdM?: number } = {},
): SegmentGraph {
  const mergeThresholdM = opts.mergeThresholdM ?? MERGE_THRESHOLD_M;
  const bridgeThresholdM = opts.bridgeThresholdM ?? BRIDGE_THRESHOLD_M;

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

  // 4. Bridge micro-gaps between trails. A dead-end endpoint (degree 1) sitting
  //    within bridgeThresholdM of another trail vertex, with no edge joining
  //    them, is almost always the same junction split across a road crossing:
  //    the two OSM ways meet at the road but don't share a node, so contraction
  //    left two false dead-ends a few metres apart. Merge each such dead-end into
  //    its nearest eligible neighbour and re-contract — two stubs across the road
  //    splice into one through-segment; a stub meeting a junction joins it. A
  //    genuine terminus (summit, real trail end) has no trail vertex that close,
  //    so it's left alone. Iterated to a fixpoint (each round removes a vertex).
  for (;;) {
    const degree = new Map<number, number>();
    const neighbours = new Map<number, Set<number>>();
    const addNeighbour = (a: number, b: number) => {
      const s = neighbours.get(a);
      if (s) s.add(b);
      else neighbours.set(a, new Set([b]));
    };
    for (const e of working) {
      if (e.from === e.to) continue;
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
      addNeighbour(e.from, e.to);
      addNeighbour(e.to, e.from);
    }
    const nodes = [...degree.keys()];
    // Seed the union-find over *every* endpoint (self-loops included), so find()
    // is defined for all edges in the remap below — only degree-1 nodes are
    // scanned as bridge candidates, but any edge's ends may need remapping.
    const parent = new Map<number, number>();
    for (const e of working) {
      if (!parent.has(e.from)) parent.set(e.from, e.from);
      if (!parent.has(e.to)) parent.set(e.to, e.to);
    }
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
    let didUnion = false;
    const union = (x: number, y: number) => {
      const rx = find(x);
      const ry = find(y);
      if (rx === ry) return;
      if (rx < ry) parent.set(ry, rx); // smaller osm id wins → deterministic rep
      else parent.set(rx, ry);
      didUnion = true;
    };
    for (const d of nodes) {
      if (degree.get(d) !== 1) continue;
      const cd = coord.get(d)!;
      let best = -1;
      let bestDist = bridgeThresholdM;
      for (const n of nodes) {
        if (n === d || neighbours.get(d)?.has(n) || find(n) === find(d)) continue;
        const dist = haversine(cd, coord.get(n)!);
        if (dist < bestDist) {
          bestDist = dist;
          best = n;
        }
      }
      if (best >= 0) union(d, best);
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
    // All endpoints here are real OSM nodes (POI splits happen later, in
    // attachPois, which recomputes keys for the sub-edges it creates).
    const fc = coord.get(e.from)!;
    const tc = coord.get(e.to)!;
    const edge: Edge = {
      id,
      from: vertexIndex(e.from),
      to: vertexIndex(e.to),
      lengthM: Math.round(polylineLength(e.coordinates) * 10) / 10,
      coordinates: e.coordinates,
      ways: e.ways,
      colours: e.colours,
      markings: e.markings,
      key: edgeStableKey(
        e.ways,
        endpointToken(e.from, fc[0], fc[1]),
        endpointToken(e.to, tc[0], tc[1]),
      ),
    };
    if (e.name !== undefined) edge.name = e.name;
    if (e.highway !== undefined) edge.highway = e.highway;
    return edge;
  });

  return { vertices, edges };
}
