// Integration check over the committed hospitality layer (data/hospitality.json).
// Guards the T12b "product": that the 🍷 overlay set is non-trivial, well-formed,
// and actually clipped to the trail network (every pin within the clip radius).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SegmentGraph } from "./graph.ts";
import {
  networkAnchors,
  withinOfNetwork,
  HOSPITALITY_CLIP_M,
  type HospitalityData,
} from "./attach-hospitality.ts";
import { HOSPITALITY_KINDS } from "../ingest/pois.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(
  readFileSync(resolve(__dirname, "../data/segments.json"), "utf8"),
) as SegmentGraph;
const h = JSON.parse(
  readFileSync(resolve(__dirname, "../data/hospitality.json"), "utf8"),
) as HospitalityData;

describe("data/hospitality.json", () => {
  it("has a sane, non-trivial count of hospitality POIs", () => {
    expect(h.pois.length).toBeGreaterThan(100);
    // A sanity ceiling: far fewer than the ~6000 raw hospitality POIs in the bbox,
    // i.e. the clip actually dropped the urban bulk.
    expect(h.pois.length).toBeLessThan(6000);
  });

  it("carries all three kinds (food, drink, picnic)", () => {
    const kinds = new Set(h.pois.map((p) => p.kind));
    for (const k of HOSPITALITY_KINDS) expect(kinds.has(k)).toBe(true);
  });

  it("only uses known kinds and finite coordinates", () => {
    const known = new Set<string>(HOSPITALITY_KINDS);
    for (const p of h.pois) {
      expect(known.has(p.kind)).toBe(true);
      expect(Number.isFinite(p.lon)).toBe(true);
      expect(Number.isFinite(p.lat)).toBe(true);
    }
  });

  it("keeps every POI within the clip radius of the trail network", () => {
    const anchors = networkAnchors(g);
    const offenders = h.pois.filter((p) => !withinOfNetwork([p.lon, p.lat], anchors, HOSPITALITY_CLIP_M));
    expect(offenders).toHaveLength(0);
  });

  it("has no duplicate pin (same kind + rounded position)", () => {
    const seen = new Set<string>();
    for (const p of h.pois) {
      const key = `${p.kind}@${p.lon.toFixed(5)},${p.lat.toFixed(5)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
