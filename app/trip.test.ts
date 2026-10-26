import { describe, it, expect } from "vitest";
import {
  pickRandomSegment,
  pickNovelSegment,
  kocaPool,
  segmentsTouchingVertices,
  shareEndpoints,
  mapyRouteUrl,
  formatDistance,
  trailColour,
  poiLabel,
  endpointsText,
  segmentsInBounds,
  accessSummary,
  mapyTripUrl,
  subsampleEvenly,
} from "./trip.ts";
import type { Edge } from "../graph/graph.ts";
import { emptyProfile, markWalked } from "./profile.ts";

function edge(partial: Partial<Edge>): Edge {
  const base: Edge = {
    id: 0,
    from: 0,
    to: 1,
    lengthM: 100,
    coordinates: [
      [19.0, 47.5],
      [19.01, 47.51],
    ],
    ways: [1],
    colours: [],
    markings: [],
    key: "k0",
    ...partial,
  };
  // Default the stable key off the id (unless the caller set one) so each test
  // edge has a distinct key — the profile keys on `key`, not the index.
  if (partial.key === undefined) base.key = `k${base.id}`;
  return base;
}

describe("pickRandomSegment", () => {
  const edges = [edge({ id: 0 }), edge({ id: 1 }), edge({ id: 2 })];

  it("picks by index from the rng", () => {
    expect(pickRandomSegment(edges, () => 0).id).toBe(0);
    expect(pickRandomSegment(edges, () => 0.5).id).toBe(1);
    expect(pickRandomSegment(edges, () => 0.999).id).toBe(2);
  });

  it("throws on an empty list", () => {
    expect(() => pickRandomSegment([])).toThrow();
  });
});

describe("pickNovelSegment", () => {
  const edges = [edge({ id: 0 }), edge({ id: 1 }), edge({ id: 2 })];

  it("picks only from never-walked segments when some exist", () => {
    const profile = markWalked(emptyProfile(), ["k0"], 1000);
    // rng=0 would hit index 0, but 0 is walked, so the fresh pool is [1,2].
    expect(pickNovelSegment(edges, profile, () => 0).id).toBe(1);
    expect(pickNovelSegment(edges, profile, () => 0.999).id).toBe(2);
  });

  it("falls back to all segments when every one is walked, weighted by age", () => {
    // 0 walked long ago, 1 recently, 2 in between → oldest (0) is likeliest.
    let p = markWalked(emptyProfile(), ["k0"], 0);
    p = markWalked(p, ["k1"], 9000);
    p = markWalked(p, ["k2"], 5000);
    const now = 10_000;
    // ages: 0→10000, 1→1000, 2→5000; total 16000. rng→0 lands in the first (0).
    expect(pickNovelSegment(edges, p, () => 0, now).id).toBe(0);
    // just past 0's slice (10000/16000 ≈ 0.625) lands in 1's slice.
    expect(pickNovelSegment(edges, p, () => 0.63, now).id).toBe(1);
    // the tail lands in 2's slice.
    expect(pickNovelSegment(edges, p, () => 0.99, now).id).toBe(2);
  });

  it("behaves like a uniform pick when nothing is walked", () => {
    const p = emptyProfile();
    expect(pickNovelSegment(edges, p, () => 0).id).toBe(0);
    expect(pickNovelSegment(edges, p, () => 0.5).id).toBe(1);
  });

  it("throws on an empty list", () => {
    expect(() => pickNovelSegment([], emptyProfile())).toThrow();
  });
});

describe("segmentsTouchingVertices", () => {
  it("keeps segments with either endpoint in the set", () => {
    const edges = [
      edge({ id: 0, from: 10, to: 11 }),
      edge({ id: 1, from: 11, to: 12 }),
      edge({ id: 2, from: 20, to: 21 }),
    ];
    const got = segmentsTouchingVertices(edges, new Set([11])).map((e) => e.id);
    expect(got).toEqual([0, 1]);
  });

  it("empty set keeps nothing", () => {
    const edges = [edge({ id: 0 })];
    expect(segmentsTouchingVertices(edges, new Set())).toEqual([]);
  });
});

describe("kocaPool", () => {
  const edges = [edge({ id: 0 }), edge({ id: 1 }), edge({ id: 2 }), edge({ id: 3 })];

  it("concatenates the popular seed with the walked segments", () => {
    const popular = [edge({ id: 0 })];
    const p = markWalked(emptyProfile(), ["k2"], 1000);
    expect(kocaPool(popular, edges, p).map((e) => e.id)).toEqual([0, 2]);
  });

  it("keeps a popular segment that is also walked twice (doubly likely)", () => {
    const popular = [edge({ id: 2 })];
    const p = markWalked(emptyProfile(), ["k2"], 1000);
    expect(kocaPool(popular, edges, p).map((e) => e.id)).toEqual([2, 2]);
  });

  it("falls back to just the popular seed on an empty profile", () => {
    const popular = [edge({ id: 0 }), edge({ id: 1 })];
    expect(kocaPool(popular, edges, emptyProfile()).map((e) => e.id)).toEqual([0, 1]);
  });

  it("is empty when there is no popular seed and nothing is walked", () => {
    expect(kocaPool([], edges, emptyProfile())).toEqual([]);
  });
});

describe("shareEndpoints", () => {
  it("returns the first and last coordinate for a normal segment", () => {
    const e = edge({
      from: 0,
      to: 1,
      coordinates: [
        [19.0, 47.5],
        [19.005, 47.505],
        [19.01, 47.51],
      ],
    });
    expect(shareEndpoints(e)).toEqual([
      [19.0, 47.5],
      [19.01, 47.51],
    ]);
  });

  it("aims at the far side of a self-loop (same start/end vertex)", () => {
    const e = edge({
      from: 3,
      to: 3,
      coordinates: [
        [19.0, 47.5],
        [19.01, 47.51],
        [19.02, 47.5], // mid of a 5-point loop
        [19.01, 47.49],
        [19.0, 47.5],
      ],
    });
    const [a, b] = shareEndpoints(e);
    expect(a).toEqual([19.0, 47.5]);
    expect(b).toEqual([19.02, 47.5]);
  });
});

describe("mapyRouteUrl", () => {
  it("builds a foot_hiking outdoor route with lon,lat points", () => {
    const url = mapyRouteUrl([19.0, 47.5], [18.9, 47.6]);
    expect(url).toContain("mapy.com/fnc/v1/route");
    expect(url).toContain("routeType=foot_hiking");
    expect(url).toContain("mapset=outdoor");
    expect(url).toContain("start=19,47.5");
    expect(url).toContain("end=18.9,47.6");
  });
});

describe("formatDistance", () => {
  it("uses metres below 1km and a Hungarian comma above", () => {
    expect(formatDistance(150)).toBe("150 m");
    expect(formatDistance(999)).toBe("999 m");
    expect(formatDistance(1000)).toBe("1,0 km");
    expect(formatDistance(1234)).toBe("1,2 km");
  });
});

describe("trailColour", () => {
  it("maps a single waymark colour to its hex", () => {
    expect(trailColour(["green"])).toBe("#2f9e44");
  });

  it("prefers the national blue on shared sections", () => {
    expect(trailColour(["red", "blue"])).toBe("#1c66c9");
    expect(trailColour(["yellow", "green"])).toBe("#2f9e44");
  });

  it("falls back for unknown or empty colours", () => {
    expect(trailColour(["pink"])).toBe("#e8590c");
    expect(trailColour([])).toBe("#e8590c");
  });
});

describe("poiLabel / endpointsText", () => {
  it("prefixes a kind icon to a named endpoint", () => {
    expect(poiLabel({ name: "Hármashatár-hegy", poiKind: "peak" })).toBe("⛰️ Hármashatár-hegy");
    expect(poiLabel({ name: "Ibolya-forrás", poiKind: "spring" })).toBe("💧 Ibolya-forrás");
  });

  it("returns the bare name for an unknown kind and null when unnamed", () => {
    expect(poiLabel({ name: "Valami", poiKind: "weird" })).toBe("Valami");
    expect(poiLabel({})).toBeNull();
  });

  it("joins two endpoints, using a dot for the unnamed side", () => {
    expect(
      endpointsText({ name: "Hárs-hegy", poiKind: "peak" }, { name: "János-forrás", poiKind: "spring" }),
    ).toBe("⛰️ Hárs-hegy → 💧 János-forrás");
    expect(endpointsText({ name: "Hárs-hegy", poiKind: "peak" }, {})).toBe("⛰️ Hárs-hegy → ·");
  });

  it("returns null when neither endpoint is named", () => {
    expect(endpointsText({}, {})).toBeNull();
  });
});

describe("segmentsInBounds", () => {
  const seg = (coords: [number, number][], id = 0): Edge =>
    ({ id, from: 0, to: 1, lengthM: 100, coordinates: coords, ways: [1], colours: [], markings: [], key: `k${id}` });
  // viewport over the Buda hills
  const view = { west: 18.95, south: 47.5, east: 19.05, north: 47.56 };

  it("keeps a segment inside the viewport", () => {
    const s = seg([[19.0, 47.52], [19.01, 47.53]]);
    expect(segmentsInBounds([s], view)).toHaveLength(1);
  });

  it("drops a segment fully outside the viewport", () => {
    const s = seg([[18.0, 47.0], [18.01, 47.01]]);
    expect(segmentsInBounds([s], view)).toHaveLength(0);
  });

  it("keeps a segment that straddles the viewport boundary", () => {
    const s = seg([[18.90, 47.52], [19.0, 47.52]]); // enters from the west
    expect(segmentsInBounds([s], view)).toHaveLength(1);
  });

  it("filters a mixed set to only the visible ones", () => {
    const inside = seg([[19.0, 47.52], [19.02, 47.53]], 1);
    const outside = seg([[20.0, 48.0], [20.1, 48.1]], 2);
    const result = segmentsInBounds([inside, outside], view);
    expect(result.map((e) => e.id)).toEqual([1]);
  });
});

describe("accessSummary", () => {
  const ap = (lon: number, lat: number, distM: number) => ({ lon, lat, distM });

  it("lists the crow-flies parking distance for each end", () => {
    expect(accessSummary(ap(19, 47, 164), ap(19.01, 47, 812))).toBe("🅿️ 164 m · 812 m");
  });

  it("dedupes when both ends share one lot", () => {
    const shared = ap(19, 47, 400);
    expect(accessSummary(shared, shared)).toBe("🅿️ 400 m");
  });

  it("handles one end only, and returns null for none", () => {
    expect(accessSummary(ap(19, 47, 500), undefined)).toBe("🅿️ 500 m");
    expect(accessSummary(undefined, undefined)).toBeNull();
  });
});

describe("mapyTripUrl", () => {
  it("returns null for fewer than two points", () => {
    expect(mapyTripUrl([])).toBeNull();
    expect(mapyTripUrl([[19, 47]])).toBeNull();
  });

  it("maps two points to start/end with no waypoints", () => {
    expect(mapyTripUrl([[19.0, 47.0], [19.1, 47.1]])).toBe(
      "https://mapy.com/fnc/v1/route?mapset=outdoor&routeType=foot_hiking&start=19,47&end=19.1,47.1",
    );
  });

  it("puts the interior points into semicolon-separated waypoints", () => {
    const url = mapyTripUrl([[19.0, 47.0], [19.1, 47.0], [19.2, 47.0], [19.3, 47.0]]);
    expect(url).toContain("start=19,47");
    expect(url).toContain("end=19.3,47");
    expect(url).toContain("waypoints=19.1,47;19.2,47");
  });

  it("evenly subsamples a long trip to 15 waypoints spanning the whole route", () => {
    // 2 + 30 interior + end = 32 points; interior must thin to 15, not truncate.
    const pts: [number, number][] = Array.from({ length: 32 }, (_, i) => [19 + i / 100, 47]);
    const url = mapyTripUrl(pts)!;
    const wps = url.split("waypoints=")[1].split(";");
    expect(wps).toHaveLength(15);
    expect(wps[0]).toBe("19.01,47"); // first interior point kept
    expect(wps[14]).toBe("19.3,47"); // last interior point kept (not dropped)
    expect(url).toContain("end=19.31,47"); // true end survives
  });
});

describe("subsampleEvenly", () => {
  it("returns the list unchanged when already within the cap", () => {
    expect(subsampleEvenly([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it("thins to the cap, always keeping the first and last", () => {
    const out = subsampleEvenly([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(9);
  });
});
