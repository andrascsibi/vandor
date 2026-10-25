// Pure, offline POI attachment (T4b). Snaps named POIs (peaks, saddles,
// viewpoints, springs, shelters) onto the segment graph so segments get
// meaningful named endpoints:
//
//   - A POI within MIN_FRAGMENT_M (along the edge) of an endpoint just NAMES
//     that existing vertex — no new geometry.
//   - A POI mid-segment (a trail passes through a peak with no junction there)
//     SPLITS the edge at the snap point, creating a new named degree-2 vertex.
//   - A POI farther than SNAP_RADIUS_M from every trail is off the marked net
//     and is skipped (the planner may use it later as an access point).
//
// Guards: splits never create a sub-MIN_FRAGMENT edge (a too-close POI attaches
// to the neighbouring vertex instead); when several POIs claim one vertex the
// higher-priority kind (POI_KINDS order) wins. No filesystem, no DOM.

import {
  MERGE_THRESHOLD_M,
  edgeStableKey,
  endpointToken,
  haversine,
  type Edge,
  type SegmentGraph,
  type Vertex,
} from "./graph.ts";
import { POI_KINDS, type PoiFeature, type PoiKind } from "../ingest/pois.ts";

export const SNAP_RADIUS_M = 60;

const EARTH_RADIUS_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Local equirectangular projection (metres) centred on `origin`, for a point. */
function project(origin: [number, number], q: [number, number]): [number, number] {
  const lat0 = rad(origin[1]);
  return [rad(q[0]) * Math.cos(lat0) * EARTH_RADIUS_M, rad(q[1]) * EARTH_RADIUS_M];
}

interface Nearest {
  /** Perpendicular distance from the point to the polyline, metres. */
  d: number;
  /** Arc-length from the polyline start to the nearest point, metres. */
  s: number;
  /** Total polyline length, metres. */
  L: number;
}

/** Nearest point on a polyline to `p`: its distance, arc-position and total length. */
function nearestOnPolyline(p: [number, number], coords: [number, number][]): Nearest {
  let best: Nearest = { d: Infinity, s: 0, L: 0 };
  let acc = 0;
  const P = project(p, p);
  for (let i = 0; i + 1 < coords.length; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const A = project(p, a);
    const B = project(p, b);
    const vx = B[0] - A[0];
    const vy = B[1] - A[1];
    const vv = vx * vx + vy * vy;
    let t = vv > 0 ? ((P[0] - A[0]) * vx + (P[1] - A[1]) * vy) / vv : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = A[0] + t * vx;
    const cy = A[1] + t * vy;
    const d = Math.hypot(P[0] - cx, P[1] - cy);
    const segLen = haversine(a, b);
    if (d < best.d) best = { d, s: acc + t * segLen, L: 0 };
    acc += segLen;
  }
  best.L = acc;
  return best;
}

/**
 * Split a polyline at the given (ascending, interior) arc-length positions.
 * Returns `positions.length + 1` sub-polylines; consecutive subs share the
 * interpolated split point exactly, so edge endpoints land on vertex coords.
 */
function splitPolyline(
  coords: [number, number][],
  positions: number[],
): [number, number][][] {
  const result: [number, number][][] = [];
  let cur: [number, number][] = [coords[0]];
  let acc = 0;
  let pi = 0;
  for (let i = 0; i + 1 < coords.length; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const segLen = haversine(a, b);
    while (pi < positions.length && positions[pi] <= acc + segLen) {
      const frac = segLen > 0 ? (positions[pi] - acc) / segLen : 0;
      const pt: [number, number] = [a[0] + frac * (b[0] - a[0]), a[1] + frac * (b[1] - a[1])];
      cur.push(pt);
      result.push(cur);
      cur = [pt];
      pi++;
    }
    cur.push(b);
    acc += segLen;
  }
  result.push(cur);
  return result;
}

const priorityOf = (kind: string): number => {
  const i = POI_KINDS.indexOf(kind as PoiKind);
  return i < 0 ? POI_KINDS.length : i;
};

/** Stamp a POI onto a vertex, keeping the higher-priority kind on conflict. */
function stampVertex(v: Vertex, poi: PoiFeature): void {
  if (v.poiKind !== undefined && priorityOf(poi.properties.kind) >= priorityOf(v.poiKind)) {
    return;
  }
  v.name = poi.properties.name;
  v.poiKind = poi.properties.kind;
  if (poi.properties.ele !== undefined) v.ele = poi.properties.ele;
  else delete v.ele;
}

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

interface SplitReq {
  s: number;
  poi: PoiFeature;
}

/**
 * Attach named POIs to a segment graph, returning a new graph. Input POIs
 * should already be the "naming" kinds; those off the marked net are ignored.
 */
export function attachPois(
  graph: SegmentGraph,
  pois: PoiFeature[],
  opts: { snapRadiusM?: number; minFragmentM?: number } = {},
): SegmentGraph {
  const SNAP = opts.snapRadiusM ?? SNAP_RADIUS_M;
  const MINFRAG = opts.minFragmentM ?? MERGE_THRESHOLD_M;

  const vertices: Vertex[] = graph.vertices.map((v) => ({ ...v }));
  const raws: RawEdge[] = graph.edges.map((e) => ({
    from: e.from,
    to: e.to,
    coordinates: e.coordinates.map((c): [number, number] => [c[0], c[1]]),
    ways: e.ways,
    colours: e.colours,
    markings: e.markings,
    name: e.name,
    highway: e.highway,
  }));

  // 1. Plan: assign each POI to its nearest edge (on the ORIGINAL edges).
  const splitsByEdge = new Map<number, SplitReq[]>();
  for (const poi of pois) {
    const p = poi.geometry.coordinates;
    let bestEdge = -1;
    let best: Nearest = { d: Infinity, s: 0, L: 0 };
    for (let ei = 0; ei < raws.length; ei++) {
      const n = nearestOnPolyline(p, raws[ei].coordinates);
      if (n.d < best.d) {
        best = n;
        bestEdge = ei;
      }
    }
    if (bestEdge < 0 || best.d > SNAP) continue; // off the marked net
    const e = raws[bestEdge];
    if (best.s <= MINFRAG) {
      stampVertex(vertices[e.from], poi);
    } else if (best.L - best.s <= MINFRAG) {
      stampVertex(vertices[e.to], poi);
    } else {
      const list = splitsByEdge.get(bestEdge);
      if (list) list.push({ s: best.s, poi });
      else splitsByEdge.set(bestEdge, [{ s: best.s, poi }]);
    }
  }

  // 2. Apply splits per edge, enforcing MINFRAG spacing.
  const finalRaws: RawEdge[] = [];
  for (let ei = 0; ei < raws.length; ei++) {
    const e = raws[ei];
    const reqs = splitsByEdge.get(ei);
    if (!reqs || reqs.length === 0) {
      finalRaws.push(e);
      continue;
    }
    reqs.sort((a, b) => a.s - b.s);
    // Greedily accept splits >= MINFRAG apart; too-close POIs stamp the last one.
    const accepted: SplitReq[] = [];
    for (const req of reqs) {
      const prev = accepted[accepted.length - 1];
      if (prev && req.s - prev.s < MINFRAG) continue; // handled after new vertices exist
      accepted.push(req);
    }
    const positions = accepted.map((a) => a.s);
    const subs = splitPolyline(e.coordinates, positions);

    // New vertex per accepted split; coord = the exact shared split point.
    const newIds: number[] = [];
    accepted.forEach((req, k) => {
      const pt = subs[k][subs[k].length - 1];
      const id = vertices.length;
      const v: Vertex = {
        id,
        osmId: -id, // synthetic: POI-split vertices have no OSM node
        lon: pt[0],
        lat: pt[1],
        name: req.poi.properties.name,
        poiKind: req.poi.properties.kind,
      };
      if (req.poi.properties.ele !== undefined) v.ele = req.poi.properties.ele;
      vertices.push(v);
      newIds.push(id);
    });
    // Too-close POIs: stamp the nearest accepted split vertex (priority-resolved).
    for (const req of reqs) {
      if (accepted.includes(req)) continue;
      let nearestK = 0;
      let dd = Infinity;
      accepted.forEach((a, k) => {
        const g = Math.abs(a.s - req.s);
        if (g < dd) {
          dd = g;
          nearestK = k;
        }
      });
      stampVertex(vertices[newIds[nearestK]], req.poi);
    }

    // Emit sub-edges, chaining from -> newIds... -> to, sharing the parent's meta.
    for (let k = 0; k < subs.length; k++) {
      const from = k === 0 ? e.from : newIds[k - 1];
      const to = k === subs.length - 1 ? e.to : newIds[k];
      finalRaws.push({ ...e, from, to, coordinates: subs[k] });
    }
  }

  // 3. Reindex into final edges with recomputed lengths.
  const edges: Edge[] = finalRaws.map((e, id) => {
    let len = 0;
    for (let i = 0; i + 1 < e.coordinates.length; i++) {
      len += haversine(e.coordinates[i], e.coordinates[i + 1]);
    }
    // Recompute the stable key from the (possibly new, synthetic) endpoints: a
    // split sub-edge gets a POI-split endpoint whose token is its rounded coord,
    // while an untouched edge's real-node tokens match what buildSegmentGraph set.
    const vf = vertices[e.from];
    const vt = vertices[e.to];
    const edge: Edge = {
      id,
      from: e.from,
      to: e.to,
      lengthM: Math.round(len * 10) / 10,
      coordinates: e.coordinates,
      ways: e.ways,
      colours: e.colours,
      markings: e.markings,
      key: edgeStableKey(
        e.ways,
        endpointToken(vf.osmId, vf.lon, vf.lat),
        endpointToken(vt.osmId, vt.lon, vt.lat),
      ),
    };
    if (e.name !== undefined) edge.name = e.name;
    if (e.highway !== undefined) edge.highway = e.highway;
    return edge;
  });

  return { vertices, edges };
}
