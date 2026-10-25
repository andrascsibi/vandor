import { describe, it, expect } from "vitest";
import { attachAccess, usableParking } from "./attach-access.ts";
import type { SegmentGraph } from "./graph.ts";
import type { PoiFeature } from "../ingest/pois.ts";

const parking = (lon: number, lat: number, name?: string, access?: string): PoiFeature => ({
  type: "Feature",
  id: Math.round(lon * 1e4 + lat),
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { osmid: 1, osmType: "node", kind: "parking", ...(name ? { name } : {}), ...(access ? { access } : {}) },
});

function twoVertexGraph(): SegmentGraph {
  return {
    vertices: [
      { id: 0, osmId: 1, lon: 19.0, lat: 47.0 },
      { id: 1, osmId: 2, lon: 19.01, lat: 47.0 },
    ],
    edges: [
      { id: 0, from: 0, to: 1, lengthM: 760, coordinates: [[19.0, 47.0], [19.01, 47.0]], ways: [1], colours: ["blue"], markings: ["K"], key: "in0" },
    ],
  };
}

describe("usableParking", () => {
  it("keeps public/paid parking and drops private/no/customers", () => {
    const pois: PoiFeature[] = [
      parking(19, 47, "Public lot"),
      parking(19, 47, "Paid garage", "yes"),
      parking(19, 47, "Gated", "private"),
      parking(19, 47, "Closed", "no"),
      parking(19, 47, "Shop only", "customers"),
    ];
    const names = usableParking(pois).map((p) => p.properties.name);
    expect(names).toEqual(["Public lot", "Paid garage"]);
  });

  it("ignores non-parking POIs", () => {
    const peak: PoiFeature = {
      type: "Feature",
      id: 9,
      geometry: { type: "Point", coordinates: [19, 47] },
      properties: { osmid: 9, osmType: "node", kind: "peak", name: "Hegy" },
    };
    expect(usableParking([peak])).toHaveLength(0);
  });
});

describe("attachAccess", () => {
  it("attaches the nearest parking to each vertex with name + distance", () => {
    const pois = [
      parking(19.0005, 47.0, "P0"), // ~38 m from vertex 0 ([19.0, 47.0])
      parking(19.0105, 47.0, "P1"), // ~38 m from vertex 1 ([19.01, 47.0])
    ];
    const g = attachAccess(twoVertexGraph(), usableParking(pois));
    expect(g.vertices[0].access?.name).toBe("P0");
    expect(g.vertices[0].access?.distM).toBeLessThan(60);
    expect(g.vertices[1].access?.name).toBe("P1");
    expect(g.vertices[1].access?.distM).toBeLessThan(60);
    // edges are passed through untouched
    expect(g.edges).toEqual(twoVertexGraph().edges);
  });

  it("leaves access undefined when there is no parking at all", () => {
    const g = attachAccess(twoVertexGraph(), []);
    expect(g.vertices[0].access).toBeUndefined();
    expect(g.vertices[1].access).toBeUndefined();
  });

  it("omits the name for an unnamed parking but still records distance", () => {
    const g = attachAccess(twoVertexGraph(), [parking(19.0, 47.0)]);
    expect(g.vertices[0].access?.name).toBeUndefined();
    expect(g.vertices[0].access?.distM).toBe(0);
  });
});
