import { describe, it, expect } from "vitest";
import {
  BUDA_HILLS_BBOX,
  SZELL_KALMAN_TER,
  bboxAround,
  buildHikingRoutesQuery,
  clipToRadius,
  haversineM,
  osmToGeoJson,
  type LonLat,
  type OverpassResponse,
  type TrailFeatureCollection,
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

describe("bboxAround", () => {
  it("returns a box that contains the circle and spans ~2·radius each way", () => {
    const r = 20_000;
    const [s, w, n, e] = bboxAround(SZELL_KALMAN_TER, r);
    const [lon, lat] = SZELL_KALMAN_TER;
    // Centred on the point.
    expect((s + n) / 2).toBeCloseTo(lat, 6);
    expect((w + e) / 2).toBeCloseTo(lon, 6);
    // N/S edges are exactly the radius away; E/W edges at least the radius.
    expect(haversineM([lon, n], SZELL_KALMAN_TER)).toBeCloseTo(r, -1);
    expect(haversineM([e, lat], SZELL_KALMAN_TER)).toBeGreaterThanOrEqual(r - 1);
  });
});

describe("clipToRadius", () => {
  const center: LonLat = SZELL_KALMAN_TER;
  const near: LonLat = [center[0] + 0.01, center[1]]; // ~750 m east
  const far: LonLat = [center[0] + 1, center[1]]; // ~75 km east
  const fc: TrailFeatureCollection = {
    type: "FeatureCollection",
    features: [
      // inside the circle → kept
      { type: "Feature", id: 1, geometry: { type: "LineString", coordinates: [near, center] }, properties: { osmid: 1, nodes: [1, 2], colours: ["blue"], markings: ["OKT"] } },
      // fully outside → dropped
      { type: "Feature", id: 2, geometry: { type: "LineString", coordinates: [far, [far[0] + 0.01, far[1]]] }, properties: { osmid: 2, nodes: [3, 4], colours: ["red"], markings: ["P"] } },
      // one end inside, one far outside → kept (touches the range)
      { type: "Feature", id: 3, geometry: { type: "LineString", coordinates: [near, far] }, properties: { osmid: 3, nodes: [5, 6], colours: ["green"], markings: ["Z"] } },
    ],
  };

  it("keeps only ways with at least one coordinate inside the radius", () => {
    const kept = clipToRadius(fc, center, 20_000);
    expect(kept.features.map((f) => f.id).sort()).toEqual([1, 3]);
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
