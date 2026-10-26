import { describe, it, expect } from "vitest";
import { DEFAULT_LENS, LENSES, LENS_META, encodeLens, isLens, parseLens, rollLabel } from "./lens.ts";
import { encodeTourHash, parseTourHash } from "./tour.ts";

describe("lens vocabulary", () => {
  it("every lens has complete metadata", () => {
    for (const l of LENSES) {
      const m = LENS_META[l];
      expect(m.icon.length).toBeGreaterThan(0);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.note.length).toBeGreaterThan(0);
      expect(m.blurb.length).toBeGreaterThan(0);
    }
  });

  it("turista is the default; kultúrista is live since T12b, the others pending", () => {
    expect(DEFAULT_LENS).toBe("turista");
    expect(LENS_META.turista.implemented).toBe(true);
    expect(LENS_META.kulturista.implemented).toBe(true);
    expect(LENS_META.fajturista.implemented).toBe(false);
    expect(LENS_META.kocaturista.implemented).toBe(false);
  });

  it("names the dob per lens — brand for the default, <Lens> dob otherwise (no 🎲)", () => {
    expect(rollLabel("turista")).toBe("Vándor dob");
    expect(rollLabel("kulturista")).toBe("Kultúrista dob");
    expect(rollLabel("fajturista")).toBe("Faj-turista dob");
    expect(rollLabel("kocaturista")).toBe("Kóca-turista dob");
  });

  it("isLens guards known values", () => {
    expect(isLens("kulturista")).toBe(true);
    expect(isLens("turista")).toBe(true);
    expect(isLens("nope")).toBe(false);
    expect(isLens(null)).toBe(false);
    expect(isLens(undefined)).toBe(false);
  });
});

describe("lens hash round-trip", () => {
  it("the default encodes to empty (keeps links clean)", () => {
    expect(encodeLens("turista")).toBe("");
  });

  it("a chosen lens encodes and parses back", () => {
    expect(encodeLens("fajturista")).toBe("l=fajturista");
    expect(parseLens("#l=fajturista")).toBe("fajturista");
    expect(parseLens("l=kulturista")).toBe("kulturista"); // tolerates a missing '#'
  });

  it("absent or invalid lens falls back to the default", () => {
    expect(parseLens("")).toBe("turista");
    expect(parseLens("#t=abc")).toBe("turista");
    expect(parseLens("#l=garbage")).toBe("turista");
  });
});

describe("composes safely with the túra hash", () => {
  it("lens and túra params don't clobber each other", () => {
    const body = [encodeTourHash(["ab", "cd"], { lon: 19, lat: 47 }), encodeLens("kulturista")]
      .filter(Boolean)
      .join("&");
    expect(body).toBe("t=ab,cd&p=19,47&l=kulturista");
    const hash = `#${body}`;
    expect(parseLens(hash)).toBe("kulturista");
    const { keys, access } = parseTourHash(hash);
    expect(keys).toEqual(["ab", "cd"]);
    expect(access).toEqual([19, 47]);
  });

  it("a lens-only hash (no túra) parses cleanly on both sides", () => {
    const hash = `#${encodeLens("fajturista")}`;
    expect(parseLens(hash)).toBe("fajturista");
    expect(parseTourHash(hash).keys).toEqual([]);
    expect(parseTourHash(hash).access).toBeNull();
  });
});
