// Integration check over the committed graph output (data/segments.json).
// Guards the T2 "product": the contraction/merge invariants that the picker
// (T3) and planner rely on.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MERGE_THRESHOLD_M, type SegmentGraph } from "./graph.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(__dirname, "../data/segments.json");
const g = JSON.parse(readFileSync(dataPath, "utf8")) as SegmentGraph;

describe("data/segments.json", () => {
  it("has a sane number of vertices and segments", () => {
    expect(g.vertices.length).toBeGreaterThan(50);
    expect(g.edges.length).toBeGreaterThan(50);
  });

  it("gives every vertex a contiguous index matching its position", () => {
    g.vertices.forEach((v, i) => expect(v.id).toBe(i));
  });

  it("has well-formed edges: positive length, >= 2 coords, in-range endpoints", () => {
    for (const e of g.edges) {
      expect(e.lengthM).toBeGreaterThan(0);
      expect(e.coordinates.length).toBeGreaterThanOrEqual(2);
      expect(e.from).toBeGreaterThanOrEqual(0);
      expect(e.from).toBeLessThan(g.vertices.length);
      expect(e.to).toBeGreaterThanOrEqual(0);
      expect(e.to).toBeLessThan(g.vertices.length);
      expect(e.ways.length).toBeGreaterThan(0);
    }
  });

  it("keeps edge endpoints geometrically on their vertices", () => {
    for (const e of g.edges) {
      const first = e.coordinates[0];
      const last = e.coordinates[e.coordinates.length - 1];
      expect(first).toEqual([g.vertices[e.from].lon, g.vertices[e.from].lat]);
      expect(last).toEqual([g.vertices[e.to].lon, g.vertices[e.to].lat]);
    }
  });

  it("has no sub-50m edge between distinct vertices (50m merge rule held)", () => {
    const offenders = g.edges.filter(
      (e) => e.from !== e.to && e.lengthM < MERGE_THRESHOLD_M,
    );
    expect(offenders).toHaveLength(0);
  });

  it("is fully contracted: no pure degree-2 pass-through vertex remains", () => {
    // Count non-self-loop edge ends per vertex. A vertex with exactly two of
    // those and no self-loop would be a pass-through that should have merged.
    const straightDeg = new Array(g.vertices.length).fill(0);
    const hasLoop = new Array(g.vertices.length).fill(false);
    for (const e of g.edges) {
      if (e.from === e.to) {
        hasLoop[e.from] = true;
      } else {
        straightDeg[e.from]++;
        straightDeg[e.to]++;
      }
    }
    const passThrough = g.vertices.filter(
      (v) => straightDeg[v.id] === 2 && !hasLoop[v.id],
    );
    expect(passThrough).toHaveLength(0);
  });

  it("has no orphan vertices (every vertex is used by some edge)", () => {
    const used = new Set<number>();
    for (const e of g.edges) {
      used.add(e.from);
      used.add(e.to);
    }
    expect(used.size).toBe(g.vertices.length);
  });

  it("carries a route marking onto every segment (all official)", () => {
    // Colour is optional (colourless tanösvény / ST* routes exist); the marking
    // is what makes the segment official, so it must always be present.
    for (const e of g.edges) {
      expect(e.markings.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("propagates the Országos Kéktúra marking through to a segment", () => {
    const markings = new Set(g.edges.flatMap((e) => e.markings));
    expect(markings.has("OKT")).toBe(true);
  });
});
