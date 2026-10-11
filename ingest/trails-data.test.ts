// Integration check over the committed ingest output (raw/trails.geojson).
// Guards the T1 "product": way count sane, geometry well-formed, a known
// Buda-hills trail present, and the node ids the graph builder depends on.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUDA_HILLS_BBOX, type TrailFeatureCollection } from "./overpass.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(__dirname, "../raw/trails.geojson");
const fc = JSON.parse(readFileSync(dataPath, "utf8")) as TrailFeatureCollection;

describe("raw/trails.geojson", () => {
  it("is a FeatureCollection with a sane number of trail ways", () => {
    expect(fc.type).toBe("FeatureCollection");
    // The Buda-hills slice has thousands of ways; anything under a few hundred
    // means the fetch was truncated or the bbox/filter regressed.
    expect(fc.features.length).toBeGreaterThan(500);
  });

  it("every feature is a LineString with >= 2 coordinates", () => {
    for (const f of fc.features) {
      expect(f.geometry.type).toBe("LineString");
      expect(f.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("carries osm node ids aligned 1:1 with coordinates (for the graph builder)", () => {
    for (const f of fc.features) {
      expect(f.properties.nodes.length).toBe(f.geometry.coordinates.length);
    }
  });

  it("contains a known Buda-hills trail", () => {
    const names = new Set(
      fc.features.map((f) => f.properties.name).filter(Boolean),
    );
    expect(names.has("Hárshegyi körút")).toBe(true);
  });

  it("geometry sits in the Buda hills (within a small boundary margin of the bbox)", () => {
    const [s, w, n, e] = BUDA_HILLS_BBOX;
    const margin = 0.01; // ways crossing the bbox edge keep nodes just outside
    for (const f of fc.features) {
      for (const [lon, lat] of f.geometry.coordinates) {
        expect(lon).toBeGreaterThanOrEqual(w - margin);
        expect(lon).toBeLessThanOrEqual(e + margin);
        expect(lat).toBeGreaterThanOrEqual(s - margin);
        expect(lat).toBeLessThanOrEqual(n + margin);
      }
    }
  });
});
