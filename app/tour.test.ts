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
  key: `k${id}`,
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
  it("encodes stable keys and an optional chosen parking", () => {
    expect(encodeTourHash(["1oqq271b9b", "zswh3ca46m"], null)).toBe("t=1oqq271b9b,zswh3ca46m");
    expect(encodeTourHash(["1oqq271b9b"], { lon: 19.02, lat: 47.5 })).toBe("t=1oqq271b9b&p=19.02,47.5");
    expect(encodeTourHash([], null)).toBe("");
  });

  it("round-trips through parse (incl. a disambiguated ~ key)", () => {
    const keys = ["1oqq271b9b", "wdgdoact1a~1abc", "zswh3ca46m"];
    const h = encodeTourHash(keys, { lon: 18.991, lat: 47.56 });
    expect(parseTourHash(`#${h}`)).toEqual({ keys, access: [18.991, 47.56] });
  });

  it("parses a hash without a chosen parking, and drops junk keys", () => {
    expect(parseTourHash("#t=abc,def")).toEqual({ keys: ["abc", "def"], access: null });
    expect(parseTourHash("")).toEqual({ keys: [], access: null });
    // uppercase / spaces / other chars aren't valid base36 key tokens → dropped
    expect(parseTourHash("#t=abc,A B,!!,def").keys).toEqual(["abc", "def"]);
  });
});
