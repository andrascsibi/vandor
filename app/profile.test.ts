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
    expect(isWalked(p, 7)).toBe(false);
    expect(lastWalked(p, 7)).toBeUndefined();
    expect(walkCount(p, 7)).toBe(0);
  });

  it("marks segments walked at a given time", () => {
    const p = markWalked(emptyProfile(), [1, 2, 3], 1000);
    expect(isWalked(p, 2)).toBe(true);
    expect(lastWalked(p, 2)).toBe(1000);
    expect(walkCount(p, 2)).toBe(1);
    expect(distinctWalkedCount(p)).toBe(3);
  });

  it("is immutable — mutators return a new profile", () => {
    const a = emptyProfile();
    const b = markWalked(a, [1], 1000);
    expect(a.walks).toEqual({});
    expect(b).not.toBe(a);
  });

  it("appends repeat walks and tracks the latest", () => {
    let p = markWalked(emptyProfile(), [5], 1000);
    p = markWalked(p, [5], 2000);
    expect(walkCount(p, 5)).toBe(2);
    expect(lastWalked(p, 5)).toBe(2000);
    expect(distinctWalkedCount(p)).toBe(1); // still one distinct segment
  });

  it("de-dupes ids within a single mark (a doubled loop segment logs once)", () => {
    const p = markWalked(emptyProfile(), [9, 9, 9], 1000);
    expect(walkCount(p, 9)).toBe(1);
  });

  it("does not count a segment with an empty history as walked", () => {
    const p: Profile = { walks: { 4: [] } };
    expect(isWalked(p, 4)).toBe(false);
    expect(distinctWalkedCount(p)).toBe(0);
  });
});
