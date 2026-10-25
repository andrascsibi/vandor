import { describe, it, expect } from "vitest";
import {
  emptyProfile,
  markWalked,
  isWalked,
  lastWalked,
  walkCount,
  distinctWalkedCount,
  type Profile,
} from "./profile.ts";

describe("profile model", () => {
  it("starts empty", () => {
    const p = emptyProfile();
    expect(distinctWalkedCount(p)).toBe(0);
    expect(isWalked(p, "a")).toBe(false);
    expect(lastWalked(p, "a")).toBeUndefined();
    expect(walkCount(p, "a")).toBe(0);
  });

  it("marks segments walked at a given time", () => {
    const p = markWalked(emptyProfile(), ["a", "b", "c"], 1000);
    expect(isWalked(p, "b")).toBe(true);
    expect(lastWalked(p, "b")).toBe(1000);
    expect(walkCount(p, "b")).toBe(1);
    expect(distinctWalkedCount(p)).toBe(3);
  });

  it("is immutable — mutators return a new profile", () => {
    const a = emptyProfile();
    const b = markWalked(a, ["a"], 1000);
    expect(a.walks).toEqual({});
    expect(b).not.toBe(a);
  });

  it("appends repeat walks and tracks the latest", () => {
    let p = markWalked(emptyProfile(), ["e"], 1000);
    p = markWalked(p, ["e"], 2000);
    expect(walkCount(p, "e")).toBe(2);
    expect(lastWalked(p, "e")).toBe(2000);
    expect(distinctWalkedCount(p)).toBe(1); // still one distinct segment
  });

  it("de-dupes keys within a single mark (a doubled loop segment logs once)", () => {
    const p = markWalked(emptyProfile(), ["x", "x", "x"], 1000);
    expect(walkCount(p, "x")).toBe(1);
  });

  it("does not count a segment with an empty history as walked", () => {
    const p: Profile = { walks: { d: [] } };
    expect(isWalked(p, "d")).toBe(false);
    expect(distinctWalkedCount(p)).toBe(0);
  });
});
