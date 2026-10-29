import { describe, it, expect } from "vitest";
import { attachElevation, elevationCoverage, elevationSummary } from "./attach-elevation.ts";
import type { Edge, SegmentGraph } from "./graph.ts";

/** Minimal edge with just the fields attachElevation reads. */
function edge(id: number, coords: [number, number][], lengthM: number): Edge {
  return {
    id,
    from: 0,
    to: 1,
    lengthM,
    coordinates: coords,
    ways: [],
    colours: [],
    markings: [],
    key: `k${id}`,
  };
}

// A plane that rises 1000 m per degree of latitude — a steady north climb.
const sample = (_lon: number, lat: number) => lat * 1000;
// A sampler that reaches nothing (off every tile).
const offTile = () => null;

describe("attachElevation", () => {
  const graph: SegmentGraph = {
    vertices: [
      { id: 0, osmId: 0, lon: 18.5, lat: 47.5 },
      { id: 1, osmId: 1, lon: 18.5, lat: 47.51 },
    ],
    edges: [
      edge(
        0,
        [
          [18.5, 47.5],
          [18.5, 47.51],
        ],
        1113,
      ),
    ],
  };

  it("bakes elevation metrics onto reachable edges", () => {
    const out = attachElevation(graph, sample);
    const m = out.edges[0].elevation!;
    expect(m).toBeDefined();
    expect(m.gainM).toBeGreaterThan(0);
    expect(m.lossM).toBe(0);
    expect(m.grade).toBeGreaterThan(0);
  });

  it("leaves edges unreachable by the sampler without elevation", () => {
    const out = attachElevation(graph, offTile);
    expect(out.edges[0].elevation).toBeUndefined();
  });

  it("does not mutate the input graph", () => {
    attachElevation(graph, sample);
    expect(graph.edges[0].elevation).toBeUndefined();
  });

  it("reports coverage and a steepest-segment summary", () => {
    const out = attachElevation(graph, sample);
    expect(elevationCoverage(out)).toEqual({ withEle: 1, total: 1 });
    const sum = elevationSummary(out);
    expect(sum.steepest?.id).toBe(0);
    expect(sum.maxGrade).toBeGreaterThan(0);
  });

  it("summarises an elevation-free graph as all zeros", () => {
    const out = attachElevation(graph, offTile);
    expect(elevationCoverage(out).withEle).toBe(0);
    expect(elevationSummary(out)).toEqual({ maxGrade: 0, medianGrade: 0 });
  });
});
