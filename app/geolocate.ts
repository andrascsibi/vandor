// FN1 — "Hol vagyok?" location dot. The browser-API glue lives in main.ts (watch
// position, device-orientation permission gesture, the Leaflet dot); the bearing
// maths is pulled out here so it's pure and testable. Two independent heading
// signals feed the arrow: the device's compass facing (deviceorientation) and the
// GPS direction of travel, with the compass preferred when present.

/** Wrap any angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

// A loose shape over DeviceOrientationEvent: the standard `alpha`/`absolute`, plus
// iOS Safari's non-standard `webkitCompassHeading`.
export interface OrientationReading {
  webkitCompassHeading?: number;
  alpha?: number | null;
  absolute?: boolean;
}

/**
 * Reduce a device-orientation reading to a compass heading — degrees clockwise from
 * north, which way the top of the phone points — or null when the reading carries no
 * absolute bearing (so the arrow stays hidden rather than spinning to a false north).
 */
export function compassHeading(e: OrientationReading): number | null {
  // iOS Safari: webkitCompassHeading is already degrees clockwise from north.
  if (typeof e.webkitCompassHeading === "number" && Number.isFinite(e.webkitCompassHeading)) {
    return normalizeDeg(e.webkitCompassHeading);
  }
  // W3C (deviceorientationabsolute, or deviceorientation with absolute=true): alpha
  // runs counter-clockwise, so the compass heading is its complement. A non-absolute
  // alpha has no fixed north reference, so we can't derive a bearing from it.
  if (e.absolute && typeof e.alpha === "number" && Number.isFinite(e.alpha)) {
    return normalizeDeg(360 - e.alpha);
  }
  return null;
}

/**
 * The GPS direction of travel (degrees clockwise from north), or null when the fix
 * carries no usable bearing. `heading` is NaN/null while stationary and only
 * meaningful once moving, so we gate it on a positive speed.
 */
export function gpsHeading(coords: { heading?: number | null; speed?: number | null }): number | null {
  const { heading, speed } = coords;
  if (heading == null || !Number.isFinite(heading)) return null;
  if (speed == null || !Number.isFinite(speed) || speed <= 0) return null;
  return normalizeDeg(heading);
}

/**
 * The bearing the location arrow should point, given both signals: the device's
 * compass facing wins (it's "which way I'm looking", what the field note asked for);
 * the GPS travel direction is the fallback; null → no arrow.
 */
export function arrowHeading(signals: { compass: number | null; gps: number | null }): number | null {
  return signals.compass ?? signals.gps;
}
