import { describe, it, expect } from "vitest";
import { buildSegmentGraph, haversine, BRIDGE_THRESHOLD_M, type SegmentGraph } from "./graph.ts";
import type { TrailFeature, TrailFeatureCollection } from "../ingest/overpass.ts";

// Helper: build a trail feature from node ids + coords (coords default to a
// line far enough apart that edges clear the 50m merge threshold unless we
// deliberately place nodes close together).
let wayId = 0;
function way(
  nodes: number[],
  coordinates: [number, number][],
  tags: Record<string, string> = {},
): TrailFeature {
  const id = ++wayId;
  return {
    type: "Feature",
    id,
    geometry: { type: "LineString", coordinates },
    properties: { ...tags, osmid: id, nodes, colours: [], markings: [] },
  };
}
function fc(features: TrailFeature[]): TrailFeatureCollection {
  return { type: "FeatureCollection", features };
}

// ~111m per 0.001° latitude at the equator; use big steps to stay > 50m.
const P = (i: number): [number, number] => [19.0, 47.5 + i * 0.002];

describe("haversine", () => {
  it("measures a ~222m north step between two 0.002° points", () => {
    expect(haversine(P(0), P(1))).toBeCloseTo(222.4, 0);
  });
});

describe("buildSegmentGraph — contraction", () => {
  it("contracts interior pass-through nodes into a single edge", () => {
    // One way, 4 nodes: only the two endpoints are vertices.
    const g = buildSegmentGraph(fc([way([1, 2, 3, 4], [P(0), P(1), P(2), P(3)])]));
    expect(g.vertices).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].coordinates).toHaveLength(4); // full polyline retained
    expect(g.edges[0].from).not.toBe(g.edges[0].to);
  });

  it("makes a shared node a junction vertex (degree 3 → vertex)", () => {
    // Two ways share node 3; a third way also touches 3 → degree 3.
    const g = buildSegmentGraph(
      fc([
        way([1, 2, 3], [P(0), P(1), P(2)]),
        way([3, 4, 5], [P(2), P(3), P(4)]),
        way([3, 6], [P(2), [19.002, 47.504]]),
      ]),
    );
    // Vertices: 1, 5, 6 (dead ends) + 3 (junction) = 4.
    expect(g.vertices).toHaveLength(4);
    expect(g.edges).toHaveLength(3);
    const junction = g.vertices.find((v) => v.osmId === 3)!;
    const touching = g.edges.filter((e) => e.from === junction.id || e.to === junction.id);
    expect(touching).toHaveLength(3);
  });

  it("contracts two ways joined end to end (degree-2 join) into one edge", () => {
    // Node 3 is the shared endpoint of both ways and has degree 2 → not a vertex.
    const g = buildSegmentGraph(
      fc([
        way([1, 2, 3], [P(0), P(1), P(2)]),
        way([3, 4, 5], [P(2), P(3), P(4)]),
      ]),
    );
    expect(g.vertices).toHaveLength(2); // only nodes 1 and 5
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].coordinates).toHaveLength(5);
    expect(g.edges[0].ways).toHaveLength(2); // spans both ways
  });

  it("keeps dead ends (degree-1 nodes) as vertices", () => {
    const g = buildSegmentGraph(fc([way([1, 2], [P(0), P(1)])]));
    expect(g.vertices).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
  });

  it("produces a self-loop edge for a pure cycle (no junction)", () => {
    // Closed way 1→2→3→1, no other way touches it.
    const g = buildSegmentGraph(
      fc([way([1, 2, 3, 1], [P(0), P(1), [19.002, 47.503], P(0)])]),
    );
    expect(g.vertices).toHaveLength(1);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].from).toBe(g.edges[0].to); // self-loop
  });
});

describe("buildSegmentGraph — 50m merge rule", () => {
  it("merges the endpoints of a sub-50m edge into one vertex and drops it", () => {
    // Two junctions (node 2 and node 3, each degree 3 via a spur) sit ~22m
    // apart — a micro-junction the 50m rule should collapse.
    const a: [number, number] = [19.0, 47.5];
    const b: [number, number] = [19.0, 47.5002]; // ~22m north of a
    expect(haversine(a, b)).toBeLessThan(50);
    const g = buildSegmentGraph(
      fc([
        way([1, 2], [P(-1), a]), // spur → node 2 (degree 3)
        way([2, 7], [a, P(-2)]), // spur → node 2
        way([2, 3], [a, b]), // ~22m micro-edge between the two junctions
        way([3, 4], [b, P(1)]), // spur → node 3 (degree 3)
        way([3, 8], [b, P(2)]), // spur → node 3
      ]),
    );
    // 2 and 3 collapse: vertices 1, 7, merged(2), 4, 8 = 5; micro-edge dropped → 4 edges.
    expect(g.vertices).toHaveLength(5);
    expect(g.edges).toHaveLength(4);
    expect(g.edges.every((e) => e.lengthM >= 50 || e.from === e.to)).toBe(true);
  });

  it("re-contracts a junction left at degree 2 after a short stub is merged away", () => {
    const a: [number, number] = [19.0, 47.502];
    const stub: [number, number] = [19.0, 47.5022]; // ~22m dead-end spur off node 2
    expect(haversine(a, stub)).toBeLessThan(50);
    const g = buildSegmentGraph(
      fc([
        way([1, 2, 3], [P(0), a, P(2)]), // main path through node 2
        way([2, 9], [a, stub]), // short spur → node 2 becomes a degree-3 junction
      ]),
    );
    // Merging the stub drops node 9 and leaves node 2 at degree 2; re-contraction
    // collapses it, so the main path is a single edge between its two ends.
    expect(g.vertices).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].coordinates).toHaveLength(3);
  });

  it("leaves no degree-2 vertex in the output", () => {
    const g = buildSegmentGraph(
      fc([
        way([1, 2, 3], [P(0), [19.0, 47.502], P(2)]),
        way([2, 9], [[19.0, 47.502], [19.0, 47.5022]]),
        way([3, 4], [P(2), P(3)]),
        way([3, 5], [P(2), [19.004, 47.504]]),
      ]),
    );
    const degree = new Array(g.vertices.length).fill(0);
    for (const e of g.edges) {
      degree[e.from]++;
      if (e.to !== e.from) degree[e.to]++;
    }
    expect(degree.some((d) => d === 2)).toBe(false);
  });
});

describe("buildSegmentGraph — bridge micro-gaps (road crossings)", () => {
  // Two ways that each dead-end, their near ends ~10m apart but sharing no node —
  // a trail crossing a road, split into two OSM ways. gapA/gapB are the two sides.
  const gapA: [number, number] = [19.0, 47.51];
  const gapB: [number, number] = [19.0, 47.5100899]; // ~10m north of gapA
  const trails = () =>
    fc([
      way([1, 2, 3], [P(0), P(1), gapA]), // dead-end node 1 … node 3 at the road
      way([4, 5, 6], [gapB, [19.0, 47.518], [19.0, 47.52]]), // node 4 at the road … dead-end node 6
    ]);

  it("merges two dead-ends across a sub-threshold gap into one through-segment", () => {
    expect(haversine(gapA, gapB)).toBeLessThan(BRIDGE_THRESHOLD_M);
    const g = buildSegmentGraph(trails());
    // nodes 3 and 4 merge → degree-2 → spliced: one edge between the real ends.
    expect(g.vertices).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].ways).toHaveLength(2); // spans both ways across the road
    expect(g.edges[0].from).not.toBe(g.edges[0].to);
  });

  it("leaves the false dead-ends in place when bridging is disabled", () => {
    const g = buildSegmentGraph(trails(), { bridgeThresholdM: 0 });
    expect(g.vertices).toHaveLength(4); // two stubs, four dead ends
    expect(g.edges).toHaveLength(2);
  });

  it("does not merge a genuine terminus far from any other trail", () => {
    // A lone spur: its dead end is nowhere near another vertex → untouched.
    const g = buildSegmentGraph(fc([way([1, 2], [P(0), P(1)])]));
    expect(g.vertices).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
  });
});

describe("buildSegmentGraph — golden", () => {
  it("matches the golden snapshot for a small mixed network", () => {
    wayId = 0; // stable osmids (1,2,3) regardless of test execution order
    const g: SegmentGraph = buildSegmentGraph(
      fc([
        way([1, 2, 3], [P(0), P(1), P(2)], { highway: "path", name: "Kéktúra" }),
        way([3, 4, 5], [P(2), P(3), P(4)], { highway: "path" }),
        way([3, 6], [P(2), [19.004, 47.504]], { highway: "footway" }),
      ]),
    );
    expect(g).toMatchSnapshot();
  });
});
