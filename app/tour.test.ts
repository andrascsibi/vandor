import { describe, it, expect } from "vitest";
import { toggleSegment, totalLengthM, orderedWaypoints } from "./tour.ts";
import type { Edge, Vertex } from "../graph/graph.ts";

const v = (id: number, lon: number, lat: number): Vertex => ({ id, osmId: id, lon, lat });
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

describe("toggleSegment", () => {
  it("adds when absent (at the end) and removes when present", () => {
    expect(toggleSegment([], 5)).toEqual([5]);
    expect(toggleSegment([5], 7)).toEqual([5, 7]);
    expect(toggleSegment([5, 7], 5)).toEqual([7]);
  });
});

describe("totalLengthM", () => {
  it("sums the lengths of the member segments", () => {
    const byId = new Map([e(1, 0, 1, 300), e(2, 1, 2, 450)].map((x) => [x.id, x]));
    expect(totalLengthM([1, 2], byId)).toBe(750);
    expect(totalLengthM([], byId)).toBe(0);
    expect(totalLengthM([1, 99], byId)).toBe(300); // unknown id ignored
  });
});

describe("orderedWaypoints", () => {
  // vertices 0..3 on a line
  const vs = new Map([v(0, 19.0, 47.0), v(1, 19.1, 47.0), v(2, 19.2, 47.0), v(3, 19.3, 47.0)].map((x) => [x.id, x]));

  it("returns the two endpoints for a single segment", () => {
    const byId = new Map([e(1, 0, 1, 300)].map((x) => [x.id, x]));
    expect(orderedWaypoints([1], byId, vs)).toEqual([[19.0, 47.0], [19.1, 47.0]]);
  });

  it("chains a path from its open end regardless of insertion order", () => {
    const byId = new Map([e(1, 1, 2, 1), e(2, 0, 1, 1), e(3, 2, 3, 1)].map((x) => [x.id, x]));
    // segments: 1-2, 0-1, 2-3 → ordered walk 0→1→2→3
    expect(orderedWaypoints([1, 2, 3], byId, vs)).toEqual([
      [19.0, 47.0], [19.1, 47.0], [19.2, 47.0], [19.3, 47.0],
    ]);
  });

  it("walks a closed loop back to the start", () => {
    const loopVs = vs;
    const byId = new Map([e(1, 0, 1, 1), e(2, 1, 2, 1), e(3, 2, 0, 1)].map((x) => [x.id, x]));
    const wp = orderedWaypoints([1, 2, 3], byId, loopVs);
    expect(wp).toHaveLength(4); // 0→1→2→0
    expect(wp[0]).toEqual(wp[3]); // returns to start
  });

  it("still returns points for a disconnected túra (jumps the gap)", () => {
    const byId = new Map([e(1, 0, 1, 1), e(2, 2, 3, 1)].map((x) => [x.id, x]));
    const wp = orderedWaypoints([1, 2], byId, vs);
    expect(wp).toHaveLength(4);
    expect(wp).toContainEqual([19.3, 47.0]);
  });
});
