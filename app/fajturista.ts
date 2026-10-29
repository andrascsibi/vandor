// Pure helpers for the 🩸 faj-turista lens (T12d). Benedek István's faj-turista is
// the "tisztafajú tenyészállat" who "csak a teljesítményt élvezi" — he reads the
// land as one number: steepness. This lens gives him x-ray vision into delta_h
// (the slope, the first derivative of height), baked per segment as `elevation`.
// No DOM, no Leaflet — the colour ramp, the histogram, the stats and the steep
// roll-pool live here so they're unit-testable; main.ts paints the aura.

import { haversine, type Edge } from "../graph/graph.ts";
import type { ElevationMetrics } from "../ingest/dem.ts";

/** An edge that carries elevation — the only kind this lens can read. */
export type GradedEdge = Edge & { elevation: ElevationMetrics };

/** Keep only the segments the DEM reached (the lens is blind to the rest). */
export function graded(edges: Edge[]): GradedEdge[] {
  return edges.filter((e): e is GradedEdge => !!e.elevation);
}

// --- The colour ramp: delta_h → colour ---------------------------------------
//
// A *sequential* encoding (magnitude), not a traffic light. The faj-turista is a
// colour-blind predator, so the ramp is a single warm family (pale → crimson, the
// classic YlOrRd) with **monotonically decreasing luminance**: that is the one
// property a red/green-blind viewer reads reliably — light = flat, dark = steep,
// regardless of hue. A near-flat segment is a pale warm wash that recedes into the
// OpenTopoMap terrain; a wall is deep blood-red (🩸) that pops against the light
// map. Domain clamps at GRADE_MAX_PCT — the network tops out ~27% mean grade and
// everything past ~18% is "brutal", so the hottest colour saturates there rather
// than wasting the ramp on outliers.

/** Mean-grade (%) at which the ramp reaches its hottest colour; above it clamps. */
export const GRADE_MAX_PCT = 18;

/** Ramp control points: fraction of the domain → sRGB, pale/flat → blood/steep. */
const RAMP: readonly [number, [number, number, number]][] = [
  [0.0, [255, 242, 176]], // #fff2b0 pale warm — flat, recedes on the map
  [0.25, [255, 210, 77]], // #ffd24d gold — a real climb begins
  [0.5, [251, 141, 60]], // #fb8d3c orange — steep
  [0.75, [230, 47, 32]], // #e62f20 blood red — a wall (🩸)
  [1.0, [140, 0, 19]], // #8c0013 deep crimson — relentless, clamped
];

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/** The ramp colour at domain fraction `t` ∈ [0,1], as `#rrggbb`. */
export function rampColor(t: number): string {
  const u = clamp01(t);
  for (let i = 1; i < RAMP.length; i++) {
    const [t1, c1] = RAMP[i];
    if (u <= t1) {
      const [t0, c0] = RAMP[i - 1];
      const f = t1 === t0 ? 0 : (u - t0) / (t1 - t0);
      return `#${hex2(c0[0] + (c1[0] - c0[0]) * f)}${hex2(c0[1] + (c1[1] - c0[1]) * f)}${hex2(c0[2] + (c1[2] - c0[2]) * f)}`;
    }
  }
  const last = RAMP[RAMP.length - 1][1];
  return `#${hex2(last[0])}${hex2(last[1])}${hex2(last[2])}`;
}

/** Colour for a mean grade in percent — the aura hue for a segment. */
export function gradeColor(gradePct: number, maxPct = GRADE_MAX_PCT): string {
  return rampColor(gradePct / maxPct);
}

/** CSS `linear-gradient(...)` of the whole ramp, for a legend bar (0 → maxPct). */
export function rampGradientCss(stops = 12): string {
  const parts: string[] = [];
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    parts.push(`${rampColor(t)} ${(t * 100).toFixed(0)}%`);
  }
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

// --- Per-subsegment grade (the within-segment aura) --------------------------
//
// The per-segment mean washes out a flat approach + a steep wall on one contracted
// segment. The polyline vertices are already ~16 m apart (finer than SRTM's 30 m),
// so we colour each span by a *local* grade — but computed over a ~90 m window, not
// per 16 m span: a 16 m delta on 30 m data is pure noise, a ~90 m window is the real
// terrain signal. Needs the per-coordinate elevations baked on the edge as `eles`.

/** Window (m) the local grade is measured over — ~3 SRTM pixels, smooths the noise. */
export const SMOOTH_WINDOW_M = 90;

/**
 * Smoothed |grade| in percent at each polyline vertex: a central difference of
 * elevation over a ~`windowM` window (clamped at the ends). `coords` and `eles`
 * must be the same length; returns one grade per vertex. A degenerate input (too
 * few points or a length mismatch) yields all-zeros, so the caller can still paint.
 */
export function smoothGrades(
  coords: [number, number][],
  eles: number[],
  windowM = SMOOTH_WINDOW_M,
): number[] {
  const n = coords.length;
  if (n < 2 || eles.length !== n) return new Array(Math.max(0, n)).fill(0);
  const cum = new Array(n).fill(0);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + haversine(coords[i - 1], coords[i]);
  const half = windowM / 2;
  const grades = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let a = i;
    while (a > 0 && cum[i] - cum[a] < half) a--;
    let b = i;
    while (b < n - 1 && cum[b] - cum[i] < half) b++;
    const d = cum[b] - cum[a];
    grades[i] = d > 0 ? (Math.abs(eles[b] - eles[a]) / d) * 100 : 0;
  }
  return grades;
}

// --- Stats -------------------------------------------------------------------

export interface GradeStats {
  /** How many segments the DEM reached (the sample behind every other number). */
  count: number;
  /** Steepest mean grade in the set, percent. */
  maxGrade: number;
  /** Median mean grade, percent — the "typical" segment. */
  medianGrade: number;
  /** 90th-percentile mean grade, percent — the edge of "hard". */
  p90Grade: number;
  /** The single steepest-pitch grade anywhere (max over any segment's window). */
  maxPitch: number;
  /** Total metres climbed across all read segments (Σ gain). */
  totalGainM: number;
  /** The steepest segment by mean grade, for the headline + a map flyTo. */
  steepest: GradedEdge | null;
}

const quantile = (sorted: number[], p: number): number =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] : 0;

/** Reduce a set of graded edges to the headline distribution numbers. */
export function gradeStats(edges: GradedEdge[]): GradeStats {
  if (edges.length === 0) {
    return {
      count: 0,
      maxGrade: 0,
      medianGrade: 0,
      p90Grade: 0,
      maxPitch: 0,
      totalGainM: 0,
      steepest: null,
    };
  }
  const grades = edges.map((e) => e.elevation.grade).sort((a, b) => a - b);
  let steepest = edges[0];
  let maxPitch = 0;
  let totalGainM = 0;
  for (const e of edges) {
    if (e.elevation.grade > steepest.elevation.grade) steepest = e;
    if (e.elevation.maxGrade > maxPitch) maxPitch = e.elevation.maxGrade;
    totalGainM += e.elevation.gainM;
  }
  return {
    count: edges.length,
    maxGrade: grades[grades.length - 1],
    medianGrade: quantile(grades, 0.5),
    p90Grade: quantile(grades, 0.9),
    maxPitch: Math.round(maxPitch * 10) / 10,
    totalGainM: Math.round(totalGainM),
    steepest,
  };
}

// --- Histogram ---------------------------------------------------------------

export interface GradeBin {
  /** Bin's lower edge (inclusive), percent. */
  lo: number;
  /** Bin's upper edge (exclusive, except the last), percent. */
  hi: number;
  /** Segments whose mean grade falls in [lo, hi). */
  count: number;
  /** Ramp colour at the bin's midpoint — ties the bars to the map aura. */
  color: string;
}

/**
 * Bin the segments' mean grades into a histogram, `binWidthPct` wide, from 0 up
 * to the data's max (rounded up to a whole bin). Each bin carries the ramp colour
 * at its midpoint so the chart doubles as the ramp's legend. Empty in → empty out.
 */
export function gradeHistogram(
  edges: GradedEdge[],
  binWidthPct = 2,
  maxPct = GRADE_MAX_PCT,
): GradeBin[] {
  if (edges.length === 0) return [];
  const grades = edges.map((e) => e.elevation.grade);
  const dataMax = Math.max(...grades);
  const nbins = Math.max(1, Math.ceil(dataMax / binWidthPct));
  const bins: GradeBin[] = [];
  for (let i = 0; i < nbins; i++) {
    const lo = i * binWidthPct;
    const hi = (i + 1) * binWidthPct;
    bins.push({ lo, hi, count: 0, color: gradeColor((lo + hi) / 2, maxPct) });
  }
  for (const g of grades) {
    const idx = Math.min(nbins - 1, Math.floor(g / binWidthPct));
    bins[idx].count++;
  }
  return bins;
}

// --- Crown ranking (the top-5 badge) -----------------------------------------

export interface SteepRank {
  edge: GradedEdge;
  /** 1-based rank among the steepest (1 = steepest). */
  rank: number;
}

/**
 * Minimum segment length to earn a place on the podium. A short flight of steps or
 * a micro-connector can hit a huge mean grade over a few metres and crowd out the
 * real climbs; the faj-turista's crowns are for *sustained* efforts, so anything
 * shorter than this is ranked out (it still shows its aura, just no crown).
 */
export const MIN_RANK_LENGTH_M = 400;

/**
 * The `n` steepest segments by mean grade, steepest first (Benedek's podium) — only
 * those at least `minLengthM` long, so a stubby stair doesn't dominate the ranking.
 */
export function topSteep(
  edges: GradedEdge[],
  n = 5,
  minLengthM = MIN_RANK_LENGTH_M,
): SteepRank[] {
  return [...edges]
    .filter((e) => e.lengthM >= minLengthM)
    .sort((a, b) => b.elevation.grade - a.elevation.grade)
    .slice(0, n)
    .map((edge, i) => ({ edge, rank: i + 1 }));
}

/** Badge text for a ranked segment: "👑 #3 · 24%". */
export function crownBadge(rank: number, gradePct: number): string {
  return `👑 #${rank} · ${Math.round(gradePct)}%`;
}

// --- The roll pool -----------------------------------------------------------

/** Default: a segment is "steep enough" for the faj-turista's roll at this quantile. */
export const STEEP_QUANTILE = 0.75;

/**
 * The faj-turista's roll pool: the steepest segments — those at or above the
 * `quantile`-th mean grade. Benedek's breeding animal only enjoys the effort, so
 * the dice lands on a hard climb; composed with `pickNovelSegment` by the caller
 * (like `kocaPool`), it still favours the untrodden *among* the steep ones, so the
 * north star survives. Empty in (no elevation anywhere) → empty out, so the caller
 * falls back to an ordinary novelty roll.
 */
export function steepPool(edges: Edge[], quantile = STEEP_QUANTILE): Edge[] {
  const g = graded(edges);
  if (g.length === 0) return [];
  const sorted = g.map((e) => e.elevation.grade).sort((a, b) => a - b);
  const threshold = sorted[Math.min(sorted.length - 1, Math.floor(quantile * (sorted.length - 1)))];
  return g.filter((e) => e.elevation.grade >= threshold);
}
