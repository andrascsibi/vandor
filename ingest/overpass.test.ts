import { describe, it, expect } from "vitest";
import {
  BUDA_HILLS_BBOX,
  buildHikingRoutesQuery,
  osmToGeoJson,
  type OverpassResponse,
} from "./overpass.ts";

describe("buildHikingRoutesQuery", () => {
  const query = buildHikingRoutesQuery(BUDA_HILLS_BBOX);

  it("selects hiking route relations and their member ways with geometry", () => {
    expect(query).toContain("[out:json]");
    expect(query).toContain('rel["route"="hiking"]');
    expect(query).toContain("way(r.r)");
    expect(query).toContain("out geom;");
    expect(query).toContain(".r out body;");
  });

  it("embeds the bbox in south,west,north,east order", () => {
    const [s, w, n, e] = BUDA_HILLS_BBOX;
    expect(query).toContain(`${s},${w},${n},${e}`);
  });
});

describe("osmToGeoJson", () => {
  const sample: OverpassResponse = {
    elements: [
      // Two hiking routes; way 1001 is on both (blue circle + red bar).
      {
        type: "relation",
        id: 1,
        tags: {
          route: "hiking",
          "osmc:symbol": "blue:white:blue_circle",
          name: "K↺ (Normafa – Hármas-kút-tető)",
        },
        members: [
          { type: "way", ref: 1001, role: "" },
          { type: "node", ref: 42, role: "guidepost" }, // ignored
        ],
      },
      {
        type: "relation",
        id: 2,
        tags: { route: "hiking", "osmc:symbol": "red:white:red_bar", ref: "P" },
        members: [{ type: "way", ref: 1001, role: "" }],
      },
      // Member way of both routes.
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
      // A non-member way (not in any route) → dropped.
      {
        type: "way",
        id: 2002,
        nodes: [8, 9],
        geometry: [
          { lat: 47.53, lon: 18.97 },
          { lat: 47.531, lon: 18.971 },
        ],
        tags: { highway: "footway" },
      },
      // A member way with only one point → dropped.
      {
        type: "way",
        id: 1003,
        nodes: [5],
        geometry: [{ lat: 47.54, lon: 18.98 }],
        tags: { highway: "path" },
      },
    ],
  };

  const fc = osmToGeoJson(sample);

  it("keeps only official member ways with usable geometry", () => {
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].id).toBe(1001);
  });

  it("emits [lon, lat] LineString coordinates", () => {
    expect(fc.features[0].geometry.coordinates).toEqual([
      [18.96, 47.52],
      [18.961, 47.521],
      [18.962, 47.522],
    ]);
  });

  it("annotates each way with the distinct colours and markings of its routes", () => {
    const { properties } = fc.features[0];
    expect(properties.colours).toEqual(["blue", "red"]);
    expect(properties.markings).toEqual(["K↺", "P"]);
  });

  it("preserves osm node ids, way id and way tags for downstream", () => {
    const { properties } = fc.features[0];
    expect(properties.osmid).toBe(1001);
    expect(properties.nodes).toEqual([1, 2, 3]);
    expect(properties.highway).toBe("path");
    expect(properties.name).toBe("Boldog-réti ösvény");
  });
});
