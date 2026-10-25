import { describe, it, expect } from "vitest";
import { attachPois } from "./attach-pois.ts";
import type { SegmentGraph } from "./graph.ts";
import type { PoiFeature, PoiKind } from "../ingest/pois.ts";

// A single ~1000 m edge along a meridian (lon constant → length ∝ Δlat).
function lineGraph(): SegmentGraph {
  return {
    vertices: [
      { id: 0, osmId: 100, lon: 19, lat: 47.0 },
      { id: 1, osmId: 101, lon: 19, lat: 47.009 },
    ],
    edges: [
      {
        id: 0,
        from: 0,
        to: 1,
        lengthM: 1000.8,
        coordinates: [
          [19, 47.0],
          [19, 47.0045],
          [19, 47.009],
        ],
        ways: [1],
        colours: ["blue"],
        markings: ["K"],
        name: "Teszt út",
        highway: "path",
        key: "in0",
      },
    ],
  };
}

const poi = (lon: number, lat: number, kind: PoiKind, name: string, ele?: number): PoiFeature => ({
  type: "Feature",
  id: Math.round(lon * 1e4 + lat),
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { osmid: 1, osmType: "node", kind, name, ...(ele !== undefined ? { ele } : {}) },
});

describe("attachPois", () => {
  it("splits an edge at a mid-segment POI, creating a named degree-2 vertex", () => {
    const g = attachPois(lineGraph(), [poi(19.0003, 47.0045, "peak", "Teszt-csúcs", 400)]);
    expect(g.vertices).toHaveLength(3);
    expect(g.edges).toHaveLength(2);
    const v2 = g.vertices[2];
    expect(v2.name).toBe("Teszt-csúcs");
    expect(v2.poiKind).toBe("peak");
    expect(v2.ele).toBe(400);
    expect(v2.lat).toBeCloseTo(47.0045, 3);
    expect(v2.lon).toBeCloseTo(19, 4);
    // chained from 0 -> 2 -> 1
    expect([g.edges[0].from, g.edges[0].to]).toEqual([0, 2]);
    expect([g.edges[1].from, g.edges[1].to]).toEqual([2, 1]);
    // endpoints land exactly on vertex coords
    const last0 = g.edges[0].coordinates.at(-1)!;
    expect(last0).toEqual([v2.lon, v2.lat]);
    expect(g.edges[1].coordinates[0]).toEqual([v2.lon, v2.lat]);
    // lengths roughly conserved
    const sum = g.edges[0].lengthM + g.edges[1].lengthM;
    expect(sum).toBeGreaterThan(995);
    expect(sum).toBeLessThan(1006);
  });

  it("names an existing endpoint when the POI is within the fragment threshold", () => {
    const g = attachPois(lineGraph(), [poi(19, 47.0002, "saddle", "Teszt-nyereg")]);
    expect(g.vertices).toHaveLength(2); // no split
    expect(g.edges).toHaveLength(1);
    expect(g.vertices[0].name).toBe("Teszt-nyereg");
    expect(g.vertices[0].poiKind).toBe("saddle");
  });

  it("ignores POIs farther than the snap radius from any trail", () => {
    const g = attachPois(lineGraph(), [poi(19.1, 47.0045, "peak", "Távoli-csúcs")]);
    expect(g.vertices).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
    expect(g.vertices.some((v) => v.name)).toBe(false);
  });

  it("makes two splits for two well-separated POIs on one edge", () => {
    const g = attachPois(lineGraph(), [
      poi(19, 47.0027, "peak", "Alsó"),
      poi(19, 47.0063, "spring", "Felső"),
    ]);
    expect(g.vertices).toHaveLength(4);
    expect(g.edges).toHaveLength(3);
    const names = g.vertices.slice(2).map((v) => v.name).sort();
    expect(names).toEqual(["Alsó", "Felső"]);
  });

  it("collapses two too-close POIs to one vertex, higher priority kind winning", () => {
    // ~20 m apart, well inside MIN_FRAGMENT (50 m): one split, peak beats spring.
    const g = attachPois(lineGraph(), [
      poi(19, 47.0045, "spring", "Forrás"),
      poi(19, 47.00468, "peak", "Csúcs"),
    ]);
    expect(g.vertices).toHaveLength(3);
    expect(g.edges).toHaveLength(2);
    expect(g.vertices[2].poiKind).toBe("peak");
    expect(g.vertices[2].name).toBe("Csúcs");
  });

  it("does not let a lower-priority POI override a named endpoint", () => {
    const g = attachPois(lineGraph(), [
      poi(19, 47.0002, "peak", "Csúcs"),
      poi(19, 47.0003, "spring", "Forrás"),
    ]);
    expect(g.vertices[0].poiKind).toBe("peak");
    expect(g.vertices[0].name).toBe("Csúcs");
  });
});
