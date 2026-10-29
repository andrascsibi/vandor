// Pure, offline DEM helpers for the 🩸 faj-turista lens (T12d). The design note
// (docs/TURISTA-LENSES.md) is explicit: NO elevation API (rate-limit, flaky) —
// instead raw SRTM 1-arcsec `.hgt` tiles, int16 big-endian, zero dependency,
// deterministic. fetch-dem.ts does the IO (download the bbox's tiles); this stays
// pure so the sampler + segment profiler are unit-testable with a synthetic tile.
//
// A `.hgt` tile is a square grid of 16-bit big-endian signed elevations (metres),
// row-major, NORTH row first, covering a 1°×1° cell. The file name N47E018 is the
// SW corner; the grid's last column of one tile duplicates the first column of its
// eastern neighbour (the "+1" in 3601 = 3600 arc-seconds + the shared edge).

import { haversine } from "../graph/graph.ts";

/** Samples per side of a 1-arcsec tile (3600 arc-seconds + the shared edge row). */
export const HGT_SIZE_1ARCSEC = 3601;
/** SRTM's void marker — a sample with no data (holds the last valid elevation). */
export const SRTM_VOID = -32768;
/** Horizontal step we resample a polyline at, metres — ~SRTM's ground resolution. */
export const PROFILE_STEP_M = 30;
/** Window for the steepest-pitch metric, metres (a short relentless wall). */
export const MAX_GRADE_WINDOW_M = 90;

/** One loaded elevation tile: its SW-corner integer lat/lon and the raw grid. */
export interface HgtTile {
  /** Integer latitude of the tile's south-west corner. */
  lat: number;
  /** Integer longitude of the tile's south-west corner. */
  lon: number;
  /** Samples per side (3601 for 1-arcsec). */
  size: number;
  /** Row-major grid, north row first; `readInt16BE`-style via the raw bytes. */
  data: Uint8Array;
}

/** Tile file-name stem for the cell whose SW corner is (`lat`,`lon`), e.g. "N47E018". */
export function tileKey(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  const la = String(Math.abs(lat)).padStart(2, "0");
  const lo = String(Math.abs(lon)).padStart(3, "0");
  return `${ns}${la}${ew}${lo}`;
}

/** The SW-corner integer cell a coordinate falls in (floor toward −∞). */
export function tileCorner(lon: number, lat: number): { lat: number; lon: number } {
  return { lat: Math.floor(lat), lon: Math.floor(lon) };
}

/** The distinct tile stems a bbox touches (inclusive of the far edges). */
export function tilesForBounds(b: {
  west: number;
  south: number;
  east: number;
  north: number;
}): string[] {
  const keys = new Set<string>();
  for (let lat = Math.floor(b.south); lat <= Math.floor(b.north); lat++) {
    for (let lon = Math.floor(b.west); lon <= Math.floor(b.east); lon++) {
      keys.add(tileKey(lat, lon));
    }
  }
  return [...keys].sort();
}

/**
 * Wrap a raw `.hgt` byte buffer as a tile. The side length is inferred from the
 * byte count (2 bytes/sample, square grid) so 1-arcsec (3601) and 3-arcsec (1201)
 * both work. Throws if the buffer isn't a whole square of int16s.
 */
export function parseHgt(bytes: Uint8Array, lat: number, lon: number): HgtTile {
  const samples = bytes.length / 2;
  const size = Math.round(Math.sqrt(samples));
  if (size * size !== samples) {
    throw new Error(`hgt ${tileKey(lat, lon)}: ${bytes.length} bytes is not a square int16 grid`);
  }
  return { lat, lon, size, data: bytes };
}

/** Raw sample at grid (row, col); row 0 = north edge. Big-endian int16, clamped. */
function rawAt(tile: HgtTile, row: number, col: number): number {
  const r = Math.max(0, Math.min(tile.size - 1, row));
  const c = Math.max(0, Math.min(tile.size - 1, col));
  const i = 2 * (r * tile.size + c);
  const hi = tile.data[i];
  const lo = tile.data[i + 1];
  // Reassemble a signed 16-bit big-endian value without a DataView (works on a
  // plain Uint8Array from either fs.readFile or a browser fetch).
  const v = (hi << 8) | lo;
  return v >= 0x8000 ? v - 0x10000 : v;
}

/**
 * A bilinear elevation sampler over a set of loaded tiles. Returns metres, or
 * `null` when the point lies outside every tile (the caller decides what to do).
 * Void samples (SRTM_VOID) are dropped from the interpolation; an all-void cell
 * yields `null`. The grid's top row is the tile's NORTH edge (lat decreasing with
 * row), so row = (cornerLat + 1 − lat) × (size − 1).
 */
export function makeSampler(tiles: HgtTile[]): (lon: number, lat: number) => number | null {
  const byKey = new Map<string, HgtTile>();
  for (const t of tiles) byKey.set(tileKey(t.lat, t.lon), t);
  return (lon, lat) => {
    const { lat: cLat, lon: cLon } = tileCorner(lon, lat);
    const tile = byKey.get(tileKey(cLat, cLon));
    if (!tile) return null;
    const n = tile.size - 1;
    const row = (cLat + 1 - lat) * n;
    const col = (lon - cLon) * n;
    const r0 = Math.floor(row);
    const c0 = Math.floor(col);
    const fr = row - r0;
    const fc = col - c0;
    // Four corners + their bilinear weights; skip voids and renormalise.
    const corners: [number, number][] = [
      [rawAt(tile, r0, c0), (1 - fr) * (1 - fc)],
      [rawAt(tile, r0, c0 + 1), (1 - fr) * fc],
      [rawAt(tile, r0 + 1, c0), fr * (1 - fc)],
      [rawAt(tile, r0 + 1, c0 + 1), fr * fc],
    ];
    let sum = 0;
    let wsum = 0;
    for (const [v, w] of corners) {
      if (v === SRTM_VOID || w === 0) continue;
      sum += v * w;
      wsum += w;
    }
    return wsum > 0 ? sum / wsum : null;
  };
}

/** Per-segment elevation metrics — the faj-turista's whole read of a segment. */
export interface ElevationMetrics {
  /** Total metres climbed along the segment (sum of positive steps). */
  gainM: number;
  /** Total metres descended (sum of |negative steps|). */
  lossM: number;
  /** Net change end − start (signed; direction is the stored polyline's). */
  netM: number;
  /** Mean absolute grade over the whole segment, percent: (gain+loss)/length×100. */
  grade: number;
  /** Steepest sustained grade over a ~MAX_GRADE_WINDOW_M window, percent. */
  maxGrade: number;
  /** Lowest sampled elevation, metres. */
  minEle: number;
  /** Highest sampled elevation, metres. */
  maxEle: number;
}

/**
 * Walk a polyline, resampling elevation at ~`stepM` horizontal spacing (so two
 * coordinates closer than one DEM pixel don't manufacture noise), and reduce the
 * stepped profile to the faj-turista's metrics. `lengthM` is the segment's true
 * horizontal length (we already store it) — used for the mean grade so it matches
 * the map. Returns `null` if the polyline can't be sampled at all (off-tile/void).
 */
export function profileSegment(
  coords: [number, number][],
  lengthM: number,
  sample: (lon: number, lat: number) => number | null,
  opts: { stepM?: number; windowM?: number } = {},
): ElevationMetrics | null {
  const stepM = opts.stepM ?? PROFILE_STEP_M;
  const windowM = opts.windowM ?? MAX_GRADE_WINDOW_M;
  if (coords.length < 2) return null;

  // Build an evenly-stepped elevation profile along the polyline.
  const profile: number[] = [];
  const firstEle = sample(coords[0][0], coords[0][1]);
  if (firstEle === null) return null;
  profile.push(firstEle);
  let carry = stepM; // distance still to walk before the next sample
  for (let i = 1; i < coords.length; i++) {
    const seg = haversine(coords[i - 1], coords[i]);
    if (seg === 0) continue;
    const [lon0, lat0] = coords[i - 1];
    const [lon1, lat1] = coords[i];
    let walked = 0;
    while (seg - walked >= carry) {
      walked += carry;
      const f = walked / seg;
      const ele = sample(lon0 + (lon1 - lon0) * f, lat0 + (lat1 - lat0) * f);
      // Hold the last valid elevation across an isolated void so a hole doesn't
      // read as a cliff; a genuine off-tile start already returned null above.
      profile.push(ele ?? profile[profile.length - 1]);
      carry = stepM;
    }
    carry -= seg - walked;
  }
  // Always include the true endpoint so net change is end-to-end.
  const lastEle = sample(coords[coords.length - 1][0], coords[coords.length - 1][1]);
  profile.push(lastEle ?? profile[profile.length - 1]);

  let gainM = 0;
  let lossM = 0;
  let minEle = profile[0];
  let maxEle = profile[0];
  for (let i = 1; i < profile.length; i++) {
    const dh = profile[i] - profile[i - 1];
    if (dh > 0) gainM += dh;
    else lossM += -dh;
    if (profile[i] < minEle) minEle = profile[i];
    if (profile[i] > maxEle) maxEle = profile[i];
  }
  const netM = profile[profile.length - 1] - profile[0];
  const grade = lengthM > 0 ? ((gainM + lossM) / lengthM) * 100 : 0;

  // Steepest pitch: the max |Δele| over any window of ~windowM, as a grade. The
  // profile is on a ~stepM grid, so a window spans `win` steps of stepM each.
  const win = Math.max(1, Math.round(windowM / stepM));
  const spanM = win * stepM;
  let maxGrade = 0;
  for (let i = win; i < profile.length; i++) {
    const g = (Math.abs(profile[i] - profile[i - win]) / spanM) * 100;
    if (g > maxGrade) maxGrade = g;
  }
  // A segment shorter than one window still has a grade; fall back to the mean.
  if (profile.length <= win) maxGrade = grade;

  const round = (x: number) => Math.round(x * 10) / 10;
  return {
    gainM: round(gainM),
    lossM: round(lossM),
    netM: round(netM),
    grade: round(grade),
    maxGrade: round(maxGrade),
    minEle: Math.round(minEle),
    maxEle: Math.round(maxEle),
  };
}
