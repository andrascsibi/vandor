import { describe, it, expect } from "vitest";
import {
  pickRandomSegment,
  shareEndpoints,
  mapyRouteUrl,
  formatDistance,
  trailColour,
  poiLabel,
  endpointsText,
  segmentsInBounds,
  accessSummary,
} from "./trip.ts";
import type { Edge } from "../graph/graph.ts";

function edge(partial: Partial<Edge>): Edge {
  return {
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
    ...partial,
  };
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
    ({ id, from: 0, to: 1, lengthM: 100, coordinates: coords, ways: [1], colours: [], markings: [] });
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
