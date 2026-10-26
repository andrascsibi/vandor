import { describe, it, expect } from "vitest";
import {
  hospitalityNear,
  hospitalityIcon,
  hospitalityTooltip,
  segmentsNearHospitality,
  HOSPITALITY_NEAR_M,
} from "./hospitality.ts";
import type { HospitalityPoi } from "../graph/attach-hospitality.ts";
import type { Edge } from "../graph/graph.ts";

const p = (lon: number, lat: number, kind: HospitalityPoi["kind"], name?: string): HospitalityPoi => ({
  lon,
  lat,
  kind,
  ...(name ? { name } : {}),
});

describe("hospitalityNear", () => {
  const anchor: [number, number] = [19.0, 47.0];
  const pois = [
    p(19.0, 47.004, "food", "Közeli"), // ~445 m → within 800 m
    p(19.0, 47.02, "drink", "Messzi"), // ~2.2 km → out
  ];

  it("keeps POIs within the walking radius of an anchor", () => {
    const near = hospitalityNear(pois, [anchor], HOSPITALITY_NEAR_M);
    expect(near.map((x) => x.name)).toEqual(["Közeli"]);
  });

  it("returns nothing when there are no anchors (empty túra)", () => {
    expect(hospitalityNear(pois, [])).toEqual([]);
  });

  it("matches a POI near any one of several anchors", () => {
    const far: [number, number] = [19.0, 47.02];
    const near = hospitalityNear(pois, [anchor, far], HOSPITALITY_NEAR_M);
    expect(near.map((x) => x.name).sort()).toEqual(["Közeli", "Messzi"]);
  });
});

describe("segmentsNearHospitality", () => {
  const seg = (id: number, coords: [number, number][]): Edge => ({
    id,
    from: 0,
    to: 1,
    lengthM: 100,
    coordinates: coords,
    ways: [1],
    colours: [],
    markings: [],
    key: `k${id}`,
  });
  const edges = [
    seg(0, [[19.0, 47.0], [19.0, 47.001], [19.0, 47.002]]), // near the café below
    seg(1, [[19.0, 47.05], [19.0, 47.051]]), // ~5.5 km away → out
  ];
  const cafe = p(19.0, 47.001, "drink", "Erdei kávézó");

  it("keeps segments with a POI near a sampled point, drops the far ones", () => {
    const near = segmentsNearHospitality(edges, [cafe], HOSPITALITY_NEAR_M);
    expect(near.map((e) => e.id)).toEqual([0]);
  });

  it("matches a POI near the segment's midpoint, not just its ends", () => {
    // Ends 2.2 km apart from the mid POI, midpoint right on it.
    const longSeg = seg(2, [[19.0, 47.0], [19.0, 47.02], [19.0, 47.04]]);
    const midPoi = p(19.0, 47.02, "food", "Féltáv Büfé");
    expect(segmentsNearHospitality([longSeg], [midPoi]).map((e) => e.id)).toEqual([2]);
  });

  it("returns nothing when there are no POIs", () => {
    expect(segmentsNearHospitality(edges, [])).toEqual([]);
  });
});

describe("labels", () => {
  it("gives each kind a glyph", () => {
    expect(hospitalityIcon("food")).toBe("🍴");
    expect(hospitalityIcon("drink")).toBe("🍷");
    expect(hospitalityIcon("picnic")).toBe("🧺");
  });

  it("tooltips the name when present, else the kind word", () => {
    expect(hospitalityTooltip(p(19, 47, "food", "Nagyrét Büfé"))).toBe("🍴 Nagyrét Büfé");
    expect(hospitalityTooltip(p(19, 47, "picnic"))).toBe("🧺 piknikhely");
  });
});
