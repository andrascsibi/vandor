import { describe, it, expect } from "vitest";
import { normalizeDeg, compassHeading, gpsHeading, arrowHeading } from "./geolocate.ts";

describe("normalizeDeg", () => {
  it("wraps any angle into [0, 360)", () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(370)).toBe(10);
    expect(normalizeDeg(-10)).toBe(350);
    expect(normalizeDeg(-370)).toBe(350);
    expect(normalizeDeg(720)).toBe(0);
  });
});

describe("compassHeading", () => {
  it("uses iOS webkitCompassHeading verbatim (already clockwise from north)", () => {
    expect(compassHeading({ webkitCompassHeading: 90 })).toBe(90);
    expect(compassHeading({ webkitCompassHeading: 0 })).toBe(0);
    // Wins over alpha when both are present.
    expect(compassHeading({ webkitCompassHeading: 123, alpha: 10, absolute: true })).toBe(123);
  });

  it("derives heading from an absolute alpha as its complement", () => {
    expect(compassHeading({ alpha: 90, absolute: true })).toBe(270);
    expect(compassHeading({ alpha: 0, absolute: true })).toBe(0);
    expect(compassHeading({ alpha: 359, absolute: true })).toBe(1);
  });

  it("returns null without an absolute bearing", () => {
    expect(compassHeading({ alpha: 90, absolute: false })).toBeNull();
    expect(compassHeading({ alpha: 90 })).toBeNull();
    expect(compassHeading({ alpha: null, absolute: true })).toBeNull();
    expect(compassHeading({})).toBeNull();
    expect(compassHeading({ webkitCompassHeading: NaN })).toBeNull();
  });
});

describe("gpsHeading", () => {
  it("returns the heading when moving", () => {
    expect(gpsHeading({ heading: 45, speed: 1.4 })).toBe(45);
    expect(gpsHeading({ heading: 370, speed: 2 })).toBe(10);
  });

  it("returns null when stationary or without a bearing", () => {
    expect(gpsHeading({ heading: 45, speed: 0 })).toBeNull();
    expect(gpsHeading({ heading: 45, speed: null })).toBeNull();
    expect(gpsHeading({ heading: null, speed: 2 })).toBeNull();
    expect(gpsHeading({ heading: NaN, speed: 2 })).toBeNull();
    expect(gpsHeading({})).toBeNull();
  });
});

describe("arrowHeading", () => {
  it("prefers the compass facing over the GPS travel direction", () => {
    expect(arrowHeading({ compass: 30, gps: 200 })).toBe(30);
  });

  it("falls back to GPS when there's no compass", () => {
    expect(arrowHeading({ compass: null, gps: 200 })).toBe(200);
  });

  it("is null when neither signal is available", () => {
    expect(arrowHeading({ compass: null, gps: null })).toBeNull();
  });
});
