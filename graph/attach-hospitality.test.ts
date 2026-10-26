import { describe, it, expect } from "vitest";
import {
  clipToNetwork,
  networkAnchors,
  withinOfNetwork,
  HOSPITALITY_CLIP_M,
} from "./attach-hospitality.ts";
import type { SegmentGraph } from "./graph.ts";
import type { PoiFeature, PoiKind } from "../ingest/pois.ts";

const poi = (lon: number, lat: number, kind: PoiKind, name?: string): PoiFeature => ({
  type: "Feature",
  id: Math.round(lon * 1e5 + lat),
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { osmid: 1, osmType: "node", kind, ...(name ? { name } : {}) },
});

// One segment along a line of latitude, with a parking access point far to the
// east of the trail (at [19.1, 47.0]).
function graph(): SegmentGraph {
  return {
    vertices: [
      { id: 0, osmId: 1, lon: 19.0, lat: 47.0, access: { lon: 19.1, lat: 47.0, distM: 300 } },
      { id: 1, osmId: 2, lon: 19.01, lat: 47.0 },
    ],
    edges: [
      {
        id: 0,
        from: 0,
        to: 1,
        lengthM: 760,
        coordinates: [[19.0, 47.0], [19.01, 47.0]],
        ways: [1],
        colours: ["blue"],
        markings: ["K"],
        key: "e0",
      },
    ],
  };
}

describe("withinOfNetwork", () => {
  const anchors: [number, number][] = [[19.0, 47.0]];
  it("accepts a point inside the clip radius", () => {
    // ~333 m north of the anchor (0.003° lat)
    expect(withinOfNetwork([19.0, 47.003], anchors, HOSPITALITY_CLIP_M)).toBe(true);
  });
  it("rejects a point beyond the clip radius", () => {
    // ~2.2 km north (0.02° lat)
    expect(withinOfNetwork([19.0, 47.02], anchors, HOSPITALITY_CLIP_M)).toBe(false);
  });
});

describe("networkAnchors", () => {
  it("includes every segment coordinate and each vertex's access point", () => {
    const a = networkAnchors(graph());
    expect(a).toContainEqual([19.0, 47.0]);
    expect(a).toContainEqual([19.01, 47.0]);
    expect(a).toContainEqual([19.1, 47.0]); // the baked access point
  });
});

describe("clipToNetwork", () => {
  it("keeps hospitality near the trail, drops the far-away and the non-hospitality", () => {
    const pois = [
      poi(19.005, 47.003, "food", "Közeli Büfé"), // ~333 m off the trail → keep
      poi(19.005, 47.02, "drink", "Messzi Kocsma"), // ~2.2 km off → drop
      poi(19.1005, 47.0, "food", "Parkoló Étterem"), // ~38 m from the access point → keep
      poi(19.0, 47.0, "peak", "Hegy"), // not hospitality → drop
    ];
    const kept = clipToNetwork(pois, graph());
    expect(kept.map((p) => p.name).sort()).toEqual(["Közeli Büfé", "Parkoló Étterem"]);
    expect(kept.every((p) => p.kind === "food")).toBe(true);
  });

  it("dedupes a POI mapped at the same spot + kind (node + way)", () => {
    const pois = [
      poi(19.005, 47.003, "drink", "Dupla"),
      poi(19.005, 47.003, "drink", "Dupla"),
    ];
    expect(clipToNetwork(pois, graph())).toHaveLength(1);
  });

  it("carries kind and omits a missing name", () => {
    const kept = clipToNetwork([poi(19.005, 47.003, "picnic")], graph());
    expect(kept).toHaveLength(1);
    expect(kept[0].kind).toBe("picnic");
    expect(kept[0].name).toBeUndefined();
  });
});
