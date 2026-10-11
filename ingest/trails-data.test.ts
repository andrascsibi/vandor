// Integration check over the committed ingest output (raw/trails.geojson).
// Guards the T1 "product": every way is an official marked trail (jelzett
// turistaút), annotated with colour + mark code, geometry well-formed, within
// the Buda-hills bbox, carrying the node ids the graph builder depends on.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUDA_HILLS_BBOX, type TrailFeatureCollection } from "./overpass.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(__dirname, "../raw/trails.geojson");
const fc = JSON.parse(readFileSync(dataPath, "utf8")) as TrailFeatureCollection;

describe("raw/trails.geojson", () => {
  it("is a FeatureCollection with a sane number of marked-trail ways", () => {
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features.length).toBeGreaterThan(100);
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

  it("only contains official trails: every way has a colour and a marking", () => {
    for (const f of fc.features) {
      expect(f.properties.colours.length).toBeGreaterThanOrEqual(1);
      expect(f.properties.markings.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("covers the four classic Hungarian mark colours", () => {
    const colours = new Set(fc.features.flatMap((f) => f.properties.colours));
    for (const c of ["blue", "red", "green", "yellow"]) {
      expect(colours.has(c)).toBe(true);
    }
  });

  it("includes the Országos Kéktúra (OKT) marking", () => {
    const markings = new Set(fc.features.flatMap((f) => f.properties.markings));
    expect(markings.has("OKT")).toBe(true);
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
