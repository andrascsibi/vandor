import { describe, it, expect } from "vitest";
import {
  HGT_SIZE_1ARCSEC,
  SRTM_VOID,
  makeSampler,
  parseHgt,
  profileSegment,
  tileCorner,
  tileKey,
  tilesForBounds,
  type HgtTile,
} from "./dem.ts";

/**
 * Build a tiny synthetic tile whose elevation is a function of grid position, so
 * we can assert exact sampler/profiler behaviour without a 26 MB real tile. The
 * grid is row-major, NORTH row first; `ele(row, col)` fills it as big-endian int16.
 */
function makeTile(
  size: number,
  lat: number,
  lon: number,
  ele: (row: number, col: number) => number,
): HgtTile {
  const data = new Uint8Array(size * size * 2);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = ele(r, c) & 0xffff;
      const i = 2 * (r * size + c);
      data[i] = (v >> 8) & 0xff;
      data[i + 1] = v & 0xff;
    }
  }
  return { lat, lon, size, data };
}

describe("tile naming + lookup", () => {
  it("names tiles by their SW corner, zero-padded", () => {
    expect(tileKey(47, 18)).toBe("N47E018");
    expect(tileKey(47, 19)).toBe("N47E019");
    expect(tileKey(-1, -1)).toBe("S01W001");
  });

  it("floors a coordinate to its containing cell", () => {
    expect(tileCorner(18.76, 47.69)).toEqual({ lat: 47, lon: 18 });
    expect(tileCorner(19.0, 47.3)).toEqual({ lat: 47, lon: 19 });
  });

  it("lists every tile a bbox touches", () => {
    expect(tilesForBounds({ west: 18.76, south: 47.31, east: 19.29, north: 47.69 })).toEqual([
      "N47E018",
      "N47E019",
    ]);
  });
});

describe("parseHgt", () => {
  it("infers the 1-arcsec side length from the byte count", () => {
    const bytes = new Uint8Array(HGT_SIZE_1ARCSEC * HGT_SIZE_1ARCSEC * 2);
    expect(parseHgt(bytes, 47, 18).size).toBe(HGT_SIZE_1ARCSEC);
  });

  it("rejects a buffer that isn't a square int16 grid", () => {
    expect(() => parseHgt(new Uint8Array(10), 47, 18)).toThrow();
  });
});

describe("makeSampler", () => {
  // A 3×3 tile over cell (47,18): corners at integer degrees, centre at .5.
  const ramp = makeTile(3, 47, 18, (row) => (2 - row) * 100); // south=0, mid=100, north=200

  it("reads the grid corners exactly (north row first)", () => {
    const s = makeSampler([ramp]);
    // Approach the NW corner from inside the cell (lat 48.0 itself floors into the
    // northern neighbour tile — the shared edge lives in both).
    expect(s(18, 47.9999)!).toBeCloseTo(200, 0); // near NW corner = top-left
    expect(s(18, 47)).toBe(0); // SW corner = bottom-left
    expect(s(18.5, 47.5)).toBeCloseTo(100); // centre
  });

  it("bilinearly interpolates between samples", () => {
    const s = makeSampler([ramp]);
    expect(s(18, 47.75)!).toBeCloseTo(150); // three-quarters up the west edge
  });

  it("returns null off every tile", () => {
    const s = makeSampler([ramp]);
    expect(s(20, 47)).toBeNull();
  });

  it("drops void corners from the interpolation", () => {
    const withHole = makeTile(3, 47, 18, (row, col) =>
      row === 0 && col === 0 ? SRTM_VOID : 100,
    );
    const s = makeSampler([withHole]);
    // Near the void corner we still get the neighbours' value, not a garbage dip.
    expect(s(18.01, 47.99)!).toBeCloseTo(100);
  });

  it("selects the right tile when several are loaded", () => {
    const east = makeTile(3, 47, 19, () => 500);
    const s = makeSampler([ramp, east]);
    expect(s(19.5, 47.5)).toBe(500);
    expect(s(18.5, 47.5)).toBeCloseTo(100);
  });
});

describe("profileSegment", () => {
  // A steep north–south ramp over cell (47,18): 2000 m per degree of latitude, so
  // a short climb clears the integer rounding on minEle/maxEle.
  const ramp = makeTile(3, 47, 18, (row) => (2 - row) * 2000);
  const sample = makeSampler([ramp]);

  it("measures a pure climb: all gain, no loss, net = +", () => {
    // ~111 m of latitude ≈ 1 m rise here; take a 0.002° climb ≈ 222 m horizontal.
    const coords: [number, number][] = [
      [18.5, 47.5],
      [18.5, 47.502],
    ];
    const m = profileSegment(coords, 222, sample)!;
    expect(m.gainM).toBeGreaterThan(0);
    expect(m.lossM).toBe(0);
    expect(m.netM).toBeCloseTo(m.gainM, 5);
    expect(m.maxEle).toBeGreaterThan(m.minEle);
  });

  it("splits gain and loss on an up-then-down profile", () => {
    const coords: [number, number][] = [
      [18.5, 47.5],
      [18.5, 47.504], // up
      [18.5, 47.5], // back down to start
    ];
    const m = profileSegment(coords, 888, sample)!;
    expect(m.gainM).toBeGreaterThan(0);
    expect(m.lossM).toBeGreaterThan(0);
    expect(m.netM).toBeCloseTo(0, 0);
    // Mean grade = (gain+loss)/length; a there-and-back climbs then drops the same.
    expect(m.grade).toBeCloseTo(((m.gainM + m.lossM) / 888) * 100, 1);
  });

  it("is flat (grade 0) along a constant-elevation line", () => {
    // East–west move stays on one grid row → constant elevation.
    const m = profileSegment(
      [
        [18.4, 47.5],
        [18.6, 47.5],
      ],
      1500,
      sample,
    )!;
    expect(m.gainM).toBe(0);
    expect(m.lossM).toBe(0);
    expect(m.grade).toBe(0);
  });

  it("returns null when the segment can't be sampled at all", () => {
    expect(
      profileSegment(
        [
          [25, 47],
          [25, 47.001],
        ],
        111,
        sample,
      ),
    ).toBeNull();
  });

  it("returns null for a degenerate (single-point) polyline", () => {
    expect(profileSegment([[18.5, 47.5]], 0, sample)).toBeNull();
  });
});
