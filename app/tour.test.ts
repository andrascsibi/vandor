import { describe, it, expect } from "vitest";
import { toggleSegment, totalLengthM, tourWalkingLengthM, isRetraceSpur, orderedWaypoints, tourAccessPoints, encodeTourHash, parseTourHash } from "./tour.ts";
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

describe("tourWalkingLengthM / isRetraceSpur", () => {
  // chain 0-1-2 plus a spur 1-3 whose tip (vertex 3) is a genuine dead end.
  const byId = new Map([e(1, 0, 1, 300), e(2, 1, 2, 450), e(3, 1, 3, 200)].map((x) => [x.id, x]));
  const retrace = new Set([3]);

  it("double-counts the spur, leaves through segments once", () => {
    expect(tourWalkingLengthM([1, 2], byId, retrace)).toBe(750); // no spur
    expect(tourWalkingLengthM([1, 2, 3], byId, retrace)).toBe(750 + 400); // 3 walked oda-vissza
    expect(tourWalkingLengthM([1, 2, 3], byId, new Set())).toBe(950); // no dead ends → plain sum
  });

  it("flags which segment is the out-and-back spur", () => {
    expect(isRetraceSpur(3, byId, retrace)).toBe(true);
    expect(isRetraceSpur(1, byId, retrace)).toBe(false);
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

  it("starts the chain at the open end nearest the preferred start (parking)", () => {
    const byId = new Map([e(1, 1, 2, 1), e(2, 0, 1, 1), e(3, 2, 3, 1)].map((x) => [x.id, x]));
    // Parking next to vertex 3's end → the walk should run 3→2→1→0, not 0→3.
    const wp = orderedWaypoints([1, 2, 3], byId, vs, [19.31, 47.0]);
    expect(wp).toEqual([
      [19.3, 47.0], [19.2, 47.0], [19.1, 47.0], [19.0, 47.0],
    ]);
  });

  it("without a preferred start keeps the open-end-first default", () => {
    const byId = new Map([e(1, 1, 2, 1), e(2, 0, 1, 1), e(3, 2, 3, 1)].map((x) => [x.id, x]));
    expect(orderedWaypoints([1, 2, 3], byId, vs)[0]).toEqual([19.0, 47.0]);
  });
});

describe("tourAccessPoints", () => {
  const vs = new Map(
    [
      { id: 0, osmId: 0, lon: 19.0, lat: 47.0, access: { lon: 18.99, lat: 47.0, name: "A", distM: 100 } },
      { id: 1, osmId: 1, lon: 19.1, lat: 47.0, access: { lon: 18.99, lat: 47.0, name: "A", distM: 300 } }, // same lot A, farther
      { id: 2, osmId: 2, lon: 19.2, lat: 47.0, access: { lon: 19.25, lat: 47.0, name: "B", distM: 150 } },
    ].map((v) => [v.id, v as Vertex]),
  );
  const byId = new Map([e(1, 0, 1, 1), e(2, 1, 2, 1)].map((x) => [x.id, x]));

  it("dedupes lots across túra endpoints, keeping the closest approach", () => {
    const cands = tourAccessPoints([1, 2], byId, vs);
    expect(cands).toHaveLength(2); // lots A and B
    const a = cands.find((c) => c.name === "A")!;
    expect(a.distM).toBe(100); // the closer of A's two endpoints
    expect(a.fromLon).toBe(19.0); // approached from vertex 0
  });

  it("returns nothing for an empty túra", () => {
    expect(tourAccessPoints([], byId, vs)).toEqual([]);
  });
});

describe("encodeTourHash / parseTourHash", () => {
  it("encodes ids and an optional chosen parking", () => {
    expect(encodeTourHash([1, 2, 3], null)).toBe("t=1,2,3");
    expect(encodeTourHash([1, 2, 3], { lon: 19.02, lat: 47.5 })).toBe("t=1,2,3&p=19.02,47.5");
    expect(encodeTourHash([], null)).toBe("");
  });

  it("round-trips through parse", () => {
    const h = encodeTourHash([58, 65, 348], { lon: 18.991, lat: 47.56 });
    expect(parseTourHash(`#${h}`)).toEqual({ ids: [58, 65, 348], access: [18.991, 47.56] });
  });

  it("parses a hash without a chosen parking, and tolerates junk", () => {
    expect(parseTourHash("#t=1,2,3")).toEqual({ ids: [1, 2, 3], access: null });
    expect(parseTourHash("")).toEqual({ ids: [], access: null });
    expect(parseTourHash("#t=1,x,-5,3").ids).toEqual([1, 3]);
  });
});
