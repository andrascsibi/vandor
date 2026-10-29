// Pure, offline elevation enrichment (T12d, the 🩸 faj-turista lens). For each
// segment, sample the DEM along its polyline and bake the per-segment metrics
// (gain/loss/net + mean & steepest grade) onto the edge as `elevation`. The lens
// reads the land through these — it never changes the túra. IO (reading the `.hgt`
// tiles off disk) lives in build-segments.ts; this stays pure and unit-testable.

import { profileSegment, type ElevationMetrics } from "../ingest/dem.ts";
import type { Edge, SegmentGraph } from "./graph.ts";

/**
 * Return a new graph with `elevation` attached to every edge the sampler can
 * reach. An edge whose polyline can't be sampled (off every loaded tile) is left
 * without elevation rather than carrying a bogus zero — the app treats a missing
 * value as "unknown", not "flat". Vertices are untouched.
 */
export function attachElevation(
  graph: SegmentGraph,
  sample: (lon: number, lat: number) => number | null,
): SegmentGraph {
  const edges: Edge[] = graph.edges.map((e) => {
    const m = profileSegment(e.coordinates, e.lengthM, sample);
    return m ? { ...e, elevation: m } : { ...e };
  });
  return { vertices: graph.vertices, edges };
}

/** Count how many edges came out with elevation — for the build log. */
export function elevationCoverage(graph: SegmentGraph): { withEle: number; total: number } {
  return {
    withEle: graph.edges.filter((e) => e.elevation).length,
    total: graph.edges.length,
  };
}

/** Summed gain/loss and the grade distribution's headline numbers, for the log. */
export function elevationSummary(graph: SegmentGraph): {
  maxGrade: number;
  steepest?: Edge;
  medianGrade: number;
} {
  const withEle = graph.edges.filter(
    (e): e is Edge & { elevation: ElevationMetrics } => !!e.elevation,
  );
  if (withEle.length === 0) return { maxGrade: 0, medianGrade: 0 };
  let steepest = withEle[0];
  for (const e of withEle) if (e.elevation.grade > steepest.elevation.grade) steepest = e;
  const grades = withEle.map((e) => e.elevation.grade).sort((a, b) => a - b);
  return {
    maxGrade: steepest.elevation.grade,
    steepest,
    medianGrade: grades[Math.floor(grades.length / 2)],
  };
}
