import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { surfaceClass, trailFraction } from "./surface.ts";
import type { SegmentGraph } from "../graph/graph.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(
  readFileSync(resolve(__dirname, "../data/segments.json"), "utf8"),
) as SegmentGraph;

describe("surfaceClass", () => {
  it("classifies natural/unpaved ways as trail", () => {
    for (const h of ["track", "path", "footway", "steps", "cycleway", "bridleway"]) {
      expect(surfaceClass(h)).toBe("trail");
    }
  });

  it("classifies quiet settlement paving as paved", () => {
    for (const h of ["residential", "living_street", "pedestrian", "service", "unclassified"]) {
      expect(surfaceClass(h)).toBe("paved");
    }
  });

  it("classifies classified motor roads as road", () => {
    for (const h of ["secondary", "tertiary", "primary", "trunk"]) {
      expect(surfaceClass(h)).toBe("road");
    }
  });

  it("falls back to paved for unknown or missing highway", () => {
    expect(surfaceClass(undefined)).toBe("paved");
    expect(surfaceClass("")).toBe("paved");
    expect(surfaceClass("raceway")).toBe("paved");
  });
});

describe("trailFraction", () => {
  it("is length-weighted, not segment-count-weighted", () => {
    const segs = [
      { highway: "path", lengthM: 900 }, // trail
      { highway: "residential", lengthM: 100 }, // paved
    ];
    expect(trailFraction(segs)).toBeCloseTo(0.9);
  });

  it("is 1 for an all-trail walk and 0 for no trail", () => {
    expect(trailFraction([{ highway: "track", lengthM: 500 }])).toBe(1);
    expect(trailFraction([{ highway: "secondary", lengthM: 500 }])).toBe(0);
  });

  it("returns 0 for an empty walk", () => {
    expect(trailFraction([])).toBe(0);
  });
});

describe("surface split over data/segments.json", () => {
  it("matches the ~67/27/6 %km research split (natural/paved/road)", () => {
    const km = { trail: 0, paved: 0, road: 0 };
    let total = 0;
    for (const e of g.edges) {
      km[surfaceClass(e.highway)] += e.lengthM;
      total += e.lengthM;
    }
    const pct = (m: number) => (100 * m) / total;
    expect(pct(km.trail)).toBeGreaterThan(60);
    expect(pct(km.trail)).toBeLessThan(74);
    expect(pct(km.paved)).toBeGreaterThan(22);
    expect(pct(km.paved)).toBeLessThan(32);
    expect(pct(km.road)).toBeGreaterThan(3);
    expect(pct(km.road)).toBeLessThan(10);
  });

  it("has natural-trail seeds for the roll (never a paved/road seed)", () => {
    // Mirrors the roll() filter in main.ts: the random pick draws from this set.
    const seeds = g.edges.filter((e) => surfaceClass(e.highway) === "trail");
    expect(seeds.length).toBeGreaterThan(0);
    for (const e of seeds) expect(surfaceClass(e.highway)).toBe("trail");
  });
});
