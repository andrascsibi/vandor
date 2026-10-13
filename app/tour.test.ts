import { describe, it, expect } from "vitest";
import { toggleSegment, totalLengthM, tourAccessPoints, encodeTourHash, parseTourHash } from "./tour.ts";
import type { Edge, Vertex } from "../graph/graph.ts";

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
