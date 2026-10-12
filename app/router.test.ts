import { describe, it, expect } from "vitest";
import {
  buildRouteGraph,
  deadEndVertices,
  vertexDegrees,
  shortestPath,
  tourOpenEnds,
  tourComponents,
  fillTourGaps,
  closeTourLoop,
} from "./router.ts";
import type { Edge } from "../graph/graph.ts";

// A square loop 0-1-2-3-0 with a diagonal chord 0-2 and a dead-end spur 1-4.
//
//        4
//        |50
//   0----1
//   |\   |
//   | \150 100
//  120  \|
//   3----2
//     100
const e = (id: number, from: number, to: number, lengthM: number): Edge => ({
  id,
  from,
  to,
  lengthM,
  coordinates: [[0, 0], [0, 0]],
  ways: [1],
  colours: [],
  markings: [],
});
const edges = [
  e(10, 0, 1, 100),
  e(11, 1, 2, 100),
  e(12, 2, 3, 100),
  e(13, 3, 0, 120),
  e(15, 0, 2, 150),
  e(14, 1, 4, 50),
];
const byId = new Map(edges.map((x) => [x.id, x]));
const g = buildRouteGraph(edges);

describe("vertexDegrees / deadEndVertices", () => {
  it("counts incident segments and finds the degree-1 dead ends", () => {
    const deg = vertexDegrees(edges);
    expect(deg.get(0)).toBe(3);
    expect(deg.get(3)).toBe(2);
    expect(deg.get(4)).toBe(1);
    expect(deadEndVertices(edges)).toEqual(new Set([4]));
  });
});

describe("shortestPath", () => {
  it("finds the cheapest route (the chord beats going around)", () => {
    const p = shortestPath(g, [0], new Set([2]))!;
    expect(p.distM).toBe(150);
    expect(p.edgeIds).toEqual([15]);
    expect(p.vertices).toEqual([0, 2]);
  });

  it("reroutes the long way when the chord is excluded", () => {
    const p = shortestPath(g, [0], new Set([2]), { excludeEdges: new Set([15]) })!;
    expect(p.distM).toBe(200);
    expect(p.edgeIds).toEqual([10, 11]);
  });

  it("returns an empty path when a source is already a target", () => {
    expect(shortestPath(g, [2], new Set([2]))).toEqual({ edgeIds: [], vertices: [2], distM: 0 });
  });

  it("returns null when the target is unreachable", () => {
    const isolated = buildRouteGraph([e(20, 7, 8, 10)]);
    expect(shortestPath(isolated, [7], new Set([99]))).toBeNull();
  });
});

describe("tourOpenEnds", () => {
  it("returns the two ends of a chain and none for a closed loop", () => {
    expect(new Set(tourOpenEnds([10, 11], byId))).toEqual(new Set([0, 2]));
    expect(tourOpenEnds([10, 11, 12, 13], byId)).toEqual([]);
  });
});

describe("tourComponents", () => {
  it("is one group when connected, several when there are gaps", () => {
    expect(tourComponents([10, 11], byId)).toEqual([[10, 11]]);
    const comps = tourComponents([10, 12], byId).map((c) => c.sort((a, b) => a - b));
    expect(comps).toEqual([[10], [12]]);
  });
});

describe("fillTourGaps", () => {
  it("adds the shortest connector between disconnected components", () => {
    // 0-1 and 2-3 are disjoint; vertex 1→2 (e11) is the cheapest stitch.
    expect(fillTourGaps([10, 12], byId, g)).toEqual([11]);
  });

  it("adds nothing to an already-continuous túra", () => {
    expect(fillTourGaps([10, 11], byId, g)).toEqual([]);
  });
});

describe("closeTourLoop", () => {
  const deadEnds = deadEndVertices(edges);

  it("routes the chain's open ends together over the rest of the net", () => {
    // Chain 0-1-2-3, open ends 0 and 3 → close with e13 (3-0) for a loop.
    expect(closeTourLoop([10, 11, 12], byId, g, deadEnds)).toEqual([13]);
  });

  it("closes nothing for an already-closed loop", () => {
    expect(closeTourLoop([10, 11, 12, 13], byId, g, deadEnds)).toEqual([]);
  });

  it("ignores a dead-end spur and loops the live ends", () => {
    // Chain 0-1-2-3 plus the spur 1-4: 4 is a dead end, so it's left as an
    // out-and-back and the loop is closed between 0 and 3.
    expect(closeTourLoop([10, 11, 12, 14], byId, g, deadEnds)).toEqual([13]);
  });
});
