import { describe, it, expect } from "vitest";
import {
  BUDA_HILLS_BBOX,
  buildTrailsQuery,
  osmToGeoJson,
  TRAIL_HIGHWAYS,
  type OverpassResponse,
} from "./overpass.ts";

describe("buildTrailsQuery", () => {
  const query = buildTrailsQuery(BUDA_HILLS_BBOX);

  it("asks for JSON and uses out geom (coords + node ids)", () => {
    expect(query).toContain("[out:json]");
    expect(query).toContain("out geom;");
  });

  it("filters on every trail highway tag", () => {
    for (const hw of TRAIL_HIGHWAYS) {
      expect(query).toContain(hw);
    }
  });

  it("embeds the bbox in south,west,north,east order", () => {
    const [s, w, n, e] = BUDA_HILLS_BBOX;
    expect(query).toContain(`${s},${w},${n},${e}`);
  });
});

describe("osmToGeoJson", () => {
  const sample: OverpassResponse = {
    elements: [
      {
        type: "way",
        id: 1001,
        nodes: [1, 2, 3],
        geometry: [
          { lat: 47.52, lon: 18.96 },
          { lat: 47.521, lon: 18.961 },
          { lat: 47.522, lon: 18.962 },
        ],
        tags: { highway: "path", name: "Boldog-réti ösvény" },
      },
      // Degenerate way: a single node, cannot be an edge → dropped.
      {
        type: "way",
        id: 1002,
        nodes: [9],
        geometry: [{ lat: 47.53, lon: 18.97 }],
        tags: { highway: "footway" },
      },
      // Non-way element → ignored.
      { type: "node", id: 5, tags: {} },
    ],
  };

  const fc = osmToGeoJson(sample);

  it("keeps only usable ways (>= 2 points)", () => {
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].id).toBe(1001);
  });

  it("emits [lon, lat] LineString coordinates", () => {
    expect(fc.features[0].geometry.type).toBe("LineString");
    expect(fc.features[0].geometry.coordinates).toEqual([
      [18.96, 47.52],
      [18.961, 47.521],
      [18.962, 47.522],
    ]);
  });

  it("preserves osm tags, way id and node ids for the graph builder", () => {
    const { properties } = fc.features[0];
    expect(properties.osmid).toBe(1001);
    expect(properties.nodes).toEqual([1, 2, 3]);
    expect(properties.highway).toBe("path");
    expect(properties.name).toBe("Boldog-réti ösvény");
  });
});
