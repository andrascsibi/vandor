import { describe, it, expect } from "vitest";
import { planWalk } from "./walk.ts";
import type { Edge, Vertex } from "../graph/graph.ts";

const e = (id: number, from: number, to: number, lengthM: number): Edge => ({
  id,
  from,
  to,
  lengthM,
  coordinates: [[0, 0], [0, 0]],
  ways: [1],
  colours: [],
  markings: [],
  key: `k${id}`,
});
const vert = (id: number, lon: number, lat: number): Vertex => ({ id, osmId: id, lon, lat });
const mapOf = <T extends { id: number }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));

// Count how many times each segment id is walked.
const counts = (ids: number[]) => {
  const m = new Map<number, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
};

describe("planWalk — linear (no parking chosen)", () => {
  const vs = mapOf([vert(0, 19.0, 47.0), vert(1, 19.1, 47.0), vert(2, 19.2, 47.0), vert(3, 19.3, 47.0)]);
  const byId = mapOf([e(1, 1, 2, 100), e(2, 0, 1, 100), e(3, 2, 3, 100)]); // chain 0-1-2-3

  it("chains from an open end, one step per segment, not closed", () => {
    const w = planWalk([1, 2, 3], byId, vs);
    expect(w.steps.map((s) => s.id)).toEqual([2, 1, 3]); // walk 0→1→2→3
    expect(w.coords).toEqual([[19.0, 47.0], [19.1, 47.0], [19.2, 47.0], [19.3, 47.0]]);
    expect(w.lengthM).toBe(300);
    expect(w.closed).toBe(false);
  });

  it("does not double a single segment while no parking is chosen", () => {
    const w = planWalk([2], byId, vs);
    expect(w.steps).toHaveLength(1);
    expect(w.lengthM).toBe(100);
    expect(w.closed).toBe(false);
  });

  it("biases the start to the open end nearest the preferred start", () => {
    const w = planWalk([1, 2, 3], byId, vs, { start: [19.31, 47.0] });
    expect(w.steps.map((s) => s.id)).toEqual([3, 1, 2]); // walk 3→2→1→0
    expect(w.coords[0]).toEqual([19.3, 47.0]);
  });
});

describe("planWalk — closed (parking chosen)", () => {
  it("walks a single segment out and back, the return flagged reversed", () => {
    const vs = mapOf([vert(0, 19.0, 47.0), vert(1, 19.1, 47.0)]);
    const byId = mapOf([e(1, 0, 1, 100)]);
    const w = planWalk([1], byId, vs, { start: [19.0, 47.0], close: true });
    expect(w.steps).toEqual([{ id: 1, reversed: false }, { id: 1, reversed: true }]);
    expect(w.coords).toEqual([[19.0, 47.0], [19.1, 47.0], [19.0, 47.0]]);
    expect(w.lengthM).toBe(200);
    expect(w.closed).toBe(true);
  });

  it("walks a pure loop once and returns to start (no duplication)", () => {
    const vs = mapOf([vert(0, 19.0, 47.0), vert(1, 19.1, 47.0), vert(2, 19.1, 47.1)]);
    const byId = mapOf([e(1, 0, 1, 100), e(2, 1, 2, 100), e(3, 2, 0, 100)]);
    const w = planWalk([1, 2, 3], byId, vs, { start: [19.0, 47.0], close: true });
    expect(counts(w.steps.map((s) => s.id))).toEqual(new Map([[1, 1], [2, 1], [3, 1]]));
    expect(w.lengthM).toBe(300);
    expect(w.closed).toBe(true);
    expect(w.coords[0]).toEqual(w.coords[w.coords.length - 1]);
  });

  it("loop + spur: starts at the loop vertex nearest the car, doubles only the spur", () => {
    // Square loop 0-1-2-3-0 + a dead-end spur 0-4 (vertex 4 west of 0).
    const vs = mapOf([
      vert(0, 19.0, 47.0), vert(1, 19.01, 47.0), vert(2, 19.01, 47.01), vert(3, 19.0, 47.01), vert(4, 18.99, 47.0),
    ]);
    const byId = mapOf([e(1, 0, 1, 100), e(2, 1, 2, 100), e(3, 2, 3, 100), e(4, 3, 0, 100), e(5, 0, 4, 70)]);
    // Park by vertex 2 (far corner) — the Kisharshegy bug would start at the tip 4.
    const w = planWalk([1, 2, 3, 4, 5], byId, vs, { start: [19.0105, 47.0105], close: true });
    expect(w.coords[0]).toEqual([19.01, 47.01]); // starts/ends at v2, not the spur tip
    expect(w.coords[w.coords.length - 1]).toEqual([19.01, 47.01]);
    expect(w.closed).toBe(true);
    const c = counts(w.steps.map((s) => s.id));
    expect(c.get(5)).toBe(2); // the spur is walked out and back
    expect([...c.values()].filter((n) => n === 1).sort()).toEqual([1, 1, 1, 1]); // the four loop edges once
    expect(w.lengthM).toBe(400 + 2 * 70);
  });

  it("doubles a mid-túra spur that is NOT a whole-network dead end (subgraph-only)", () => {
    // Star: v1 is a junction to leaves 0, 2, 3 — a tree, every edge retraced.
    const vs = mapOf([vert(0, 19.0, 47.0), vert(1, 19.1, 47.0), vert(2, 19.2, 47.0), vert(3, 19.1, 47.1)]);
    const byId = mapOf([e(1, 0, 1, 100), e(2, 1, 2, 100), e(3, 1, 3, 100)]);
    const w = planWalk([1, 2, 3], byId, vs, { start: [19.0, 47.0], close: true });
    expect(counts(w.steps.map((s) => s.id))).toEqual(new Map([[1, 2], [2, 2], [3, 2]]));
    expect(w.lengthM).toBe(600);
    expect(w.closed).toBe(true);
  });

  it("dumbbell: the connecting segment is walked twice, non-adjacently", () => {
    // Loop A {0,1,2} — bridge m(2-3) — loop B {3,4,5}.
    const vs = mapOf([
      vert(0, 19.0, 47.0), vert(1, 19.01, 47.0), vert(2, 19.01, 47.01),
      vert(3, 19.1, 47.0), vert(4, 19.11, 47.0), vert(5, 19.11, 47.01),
    ]);
    const byId = mapOf([
      e(1, 0, 1, 100), e(2, 1, 2, 100), e(3, 2, 0, 100), // loop A
      e(9, 2, 3, 50), // bridge
      e(4, 3, 4, 100), e(5, 4, 5, 100), e(6, 5, 3, 100), // loop B
    ]);
    const w = planWalk([1, 2, 3, 9, 4, 5, 6], byId, vs, { start: [19.0, 47.0], close: true });
    const ids = w.steps.map((s) => s.id);
    expect(counts(ids).get(9)).toBe(2); // bridge doubled
    const at = ids.map((id, i) => (id === 9 ? i : -1)).filter((i) => i >= 0);
    expect(at[1] - at[0]).toBeGreaterThan(1); // the two crossings are not back-to-back
    expect(w.closed).toBe(true);
    expect(w.lengthM).toBe(100 * 6 + 2 * 50);
  });

  it("falls back to a linear walk (no closing) when the túra is disconnected", () => {
    const vs = mapOf([vert(0, 19.0, 47.0), vert(1, 19.1, 47.0), vert(2, 19.2, 47.0), vert(3, 19.3, 47.0)]);
    const byId = mapOf([e(1, 0, 1, 100), e(2, 2, 3, 100)]); // two disjoint pieces
    const w = planWalk([1, 2], byId, vs, { start: [19.0, 47.0], close: true });
    expect(w.closed).toBe(false);
    expect(counts(w.steps.map((s) => s.id))).toEqual(new Map([[1, 1], [2, 1]]));
  });
});

describe("planWalk — degenerate input", () => {
  const vs = mapOf([vert(0, 19.0, 47.0), vert(1, 19.1, 47.0)]);
  it("returns an empty walk for no / unknown / self-loop-only segments", () => {
    const byId = mapOf([e(2, 0, 0, 100)]); // self-loop only
    expect(planWalk([], byId, vs)).toEqual({ steps: [], coords: [], lengthM: 0, closed: false });
    expect(planWalk([99], byId, vs).steps).toEqual([]);
    expect(planWalk([2], byId, vs, { close: true }).steps).toEqual([]);
  });
});
