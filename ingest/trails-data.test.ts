// Integration check over the committed ingest output (raw/trails.geojson).
// Guards the T1/T4a "product": every way is an official marked trail (jelzett
// turistaút), annotated with colour + mark code, geometry well-formed, within
// the ~20 km range of Széll Kálmán tér, carrying the node ids the graph builder
// depends on.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RANGE_RADIUS_M,
  SZELL_KALMAN_TER,
  haversineM,
  type TrailFeatureCollection,
} from "./overpass.ts";

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

  it("only contains official trails: every way carries a route marking", () => {
    // A marking (ref / mark code / route name) is always present — it's what
    // makes a way "official". A waymark COLOUR is not guaranteed: tanösvény,
    // the Mária-út and the urban sétaút (ST*) routes have no osmc:symbol band.
    for (const f of fc.features) {
      expect(f.properties.markings.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives the large majority of ways a waymark colour", () => {
    const withColour = fc.features.filter((f) => f.properties.colours.length > 0);
    expect(withColour.length / fc.features.length).toBeGreaterThan(0.8);
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

  it("every way touches the ~20 km range of Széll Kálmán tér (clipToRadius held)", () => {
    for (const f of fc.features) {
      const touches = f.geometry.coordinates.some(
        (c) => haversineM(c, SZELL_KALMAN_TER) <= RANGE_RADIUS_M,
      );
      expect(touches).toBe(true);
    }
  });
});
