import { describe, it, expect } from "vitest";
import type { Edge } from "../graph/graph.ts";
import type { ElevationMetrics } from "../ingest/dem.ts";
import {
  GRADE_MAX_PCT,
  crownBadge,
  gradeColor,
  gradeHistogram,
  gradeStats,
  graded,
  rampColor,
  rampGradientCss,
  smoothGrades,
  steepPool,
  topSteep,
} from "./fajturista.ts";

/** An edge carrying just the fields the lens reads, with a chosen mean grade. */
function gradeEdge(
  id: number,
  grade: number,
  extra: Partial<ElevationMetrics> = {},
  lengthM = 500, // long enough to be rankable by default (≥ MIN_RANK_LENGTH_M)
): Edge {
  const elevation: ElevationMetrics = {
    gainM: grade, // 1:1 stand-in so Σ gain is predictable in tests
    lossM: 0,
    netM: grade,
    grade,
    maxGrade: grade,
    minEle: 100,
    maxEle: 100 + grade,
    ...extra,
  };
  return {
    id,
    from: 0,
    to: 1,
    lengthM,
    coordinates: [
      [0, 0],
      [0, 1],
    ],
    ways: [],
    colours: [],
    markings: [],
    key: `k${id}`,
    elevation,
  };
}

/** An edge with no elevation at all (DEM didn't reach it). */
function flatUnknown(id: number): Edge {
  const e = gradeEdge(id, 0);
  delete (e as { elevation?: ElevationMetrics }).elevation;
  return e;
}

describe("graded", () => {
  it("keeps only edges that carry elevation", () => {
    const edges = [gradeEdge(0, 5), flatUnknown(1), gradeEdge(2, 10)];
    expect(graded(edges).map((e) => e.id)).toEqual([0, 2]);
  });
});

describe("rampColor / gradeColor", () => {
  it("returns the pale warm at the flat end and blood crimson at the steep end", () => {
    expect(rampColor(0)).toBe("#fff2b0");
    expect(rampColor(1)).toBe("#8c0013");
  });

  it("clamps outside [0,1]", () => {
    expect(rampColor(-5)).toBe(rampColor(0));
    expect(rampColor(99)).toBe(rampColor(1));
  });

  it("decreases in luminance monotonically (the one channel a colour-blind read orders)", () => {
    const lum = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const lums = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => lum(rampColor(t)));
    for (let i = 1; i < lums.length; i++) expect(lums[i]).toBeLessThan(lums[i - 1]);
  });

  it("maps a grade past the domain max to the hottest colour", () => {
    expect(gradeColor(GRADE_MAX_PCT + 10)).toBe(rampColor(1));
    expect(gradeColor(0)).toBe(rampColor(0));
  });

  it("renders a CSS gradient string across the ramp", () => {
    const css = rampGradientCss();
    expect(css.startsWith("linear-gradient(to right,")).toBe(true);
    expect(css).toContain("#fff2b0");
    expect(css).toContain("#8c0013");
  });
});

describe("smoothGrades", () => {
  // Eight points ~37 m apart along a parallel (0.0005° lon at lat 47.5).
  const coords: [number, number][] = Array.from({ length: 8 }, (_, i) => [18.9 + i * 0.0005, 47.5]);

  it("reads ~0 on a flat elevation profile", () => {
    const g = smoothGrades(coords, coords.map(() => 200));
    expect(g).toHaveLength(8);
    expect(Math.max(...g)).toBeLessThan(0.5);
  });

  it("reads a positive, roughly steady grade on a steady climb", () => {
    const climb = coords.map((_, i) => 200 + i * 5); // +5 m per ~37 m step
    const g = smoothGrades(coords, climb);
    expect(Math.min(...g)).toBeGreaterThan(5); // ~13% grade everywhere
  });

  it("localises steepness: a flat half then a steep half reads higher downstream", () => {
    // First four flat, then a sharp climb — the window makes later vertices steeper.
    const eles = [200, 200, 200, 200, 210, 220, 230, 240];
    const g = smoothGrades(coords, eles);
    expect(g[1]).toBeLessThan(g[6]);
  });

  it("returns all-zeros on a length mismatch or degenerate input", () => {
    expect(smoothGrades(coords, [1, 2, 3])).toEqual(new Array(8).fill(0));
    expect(smoothGrades([[18.9, 47.5]], [200])).toEqual([0]);
  });
});

describe("gradeStats", () => {
  it("summarises the distribution and names the steepest segment", () => {
    const edges = [gradeEdge(0, 2), gradeEdge(1, 4), gradeEdge(2, 6), gradeEdge(3, 20)];
    const s = gradeStats(graded(edges));
    expect(s.count).toBe(4);
    expect(s.maxGrade).toBe(20);
    expect(s.steepest?.id).toBe(3);
    expect(s.medianGrade).toBeGreaterThan(0);
    expect(s.totalGainM).toBe(2 + 4 + 6 + 20);
  });

  it("tracks the steepest single pitch separately from mean grade", () => {
    const edges = graded([
      gradeEdge(0, 5, { maxGrade: 40 }), // gentle on average, one short wall
      gradeEdge(1, 10, { maxGrade: 12 }),
    ]);
    const s = gradeStats(edges);
    expect(s.maxGrade).toBe(10); // steepest *mean*
    expect(s.maxPitch).toBe(40); // steepest *pitch*
  });

  it("is all zeros / null for an empty set", () => {
    const s = gradeStats([]);
    expect(s.count).toBe(0);
    expect(s.steepest).toBeNull();
  });
});

describe("gradeHistogram", () => {
  it("bins grades and colours each bin by the ramp", () => {
    const edges = graded([gradeEdge(0, 1), gradeEdge(1, 3), gradeEdge(2, 3.5), gradeEdge(3, 7)]);
    const bins = gradeHistogram(edges, 2);
    expect(bins[0]).toMatchObject({ lo: 0, hi: 2, count: 1 }); // the 1%
    expect(bins[1].count).toBe(2); // the 3% and 3.5%
    expect(bins[3].count).toBe(1); // the 7%
    expect(bins.every((b) => b.color.startsWith("#"))).toBe(true);
  });

  it("puts the maximum grade in the last bin (inclusive upper edge)", () => {
    const bins = gradeHistogram(graded([gradeEdge(0, 6)]), 2);
    expect(bins[bins.length - 1].count).toBe(1);
  });

  it("is empty for no data", () => {
    expect(gradeHistogram([], 2)).toEqual([]);
  });
});

describe("topSteep / crownBadge", () => {
  it("ranks the steepest segments first", () => {
    const edges = graded([gradeEdge(0, 3), gradeEdge(1, 25), gradeEdge(2, 12), gradeEdge(3, 8)]);
    const top = topSteep(edges, 3);
    expect(top.map((r) => r.edge.id)).toEqual([1, 2, 3]);
    expect(top.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("formats a crown badge", () => {
    expect(crownBadge(3, 24.4)).toBe("👑 #3 · 24%");
  });

  it("ranks out short segments so a stubby stair can't dominate", () => {
    const edges = graded([
      gradeEdge(0, 40, {}, 80), // a brutal 80 m stair — steepest, but too short
      gradeEdge(1, 18, {}, 600), // a real sustained climb
      gradeEdge(2, 12, {}, 500),
    ]);
    const top = topSteep(edges);
    expect(top.map((r) => r.edge.id)).toEqual([1, 2]); // the stair is excluded
  });
});

describe("steepPool", () => {
  it("returns the steepest quantile of graded edges", () => {
    const edges = [1, 2, 3, 4, 20].map((g, i) => gradeEdge(i, g));
    const pool = steepPool(edges, 0.75).map((e) => e.id);
    // 75th-percentile grade across [1,2,3,4,20] is 4 → keep grades ≥ 4.
    expect(pool).toContain(3); // grade 4
    expect(pool).toContain(4); // grade 20
    expect(pool).not.toContain(0); // grade 1
  });

  it("is empty when no edge carries elevation (caller falls back to novelty)", () => {
    expect(steepPool([flatUnknown(0), flatUnknown(1)])).toEqual([]);
  });
});
