// Pure, offline hospitality extraction + clip (T12b, the 🍷 kultúrista overlay).
// Vendéglátás is a *context-POI, never a graph vertex*: a restaurant/büfé/picnic
// site is not a place the trail graph routes through, it's something the turista
// walks a few hundred metres off the túra to reach. So unlike peaks (attach-pois)
// or parking (attach-access), these are not baked onto vertices — they're pulled
// out of the shared POI ingest and clipped to the trail network, then written to
// data/hospitality.json for the app to filter around the chosen túra at runtime.
//
// The 20 km range bbox covers half of Buda → raw hospitality is huge and mostly
// urban. Clipping to within HOSPITALITY_CLIP_M of any segment coordinate (or a
// baked access point) keeps only the hegyvidéki set actually reachable from a
// trail — small, and the "étterem sétatávban a végén" the családi field note asked
// for. No filesystem, no DOM — build-segments.ts does the IO so this stays testable.

import { haversine, type SegmentGraph } from "./graph.ts";
import { HOSPITALITY_KINDS, type HospitalityKind, type PoiFeature } from "../ingest/pois.ts";

/** How close a hospitality POI must sit to the trail network to be kept (metres). */
export const HOSPITALITY_CLIP_M = 600;

/** A hospitality context-POI: a point with a kind and optional name. */
export interface HospitalityPoi {
  lon: number;
  lat: number;
  kind: HospitalityKind;
  name?: string;
}

/** The committed hospitality layer (data/hospitality.json). */
export interface HospitalityData {
  pois: HospitalityPoi[];
}

const HOSPITALITY_SET = new Set<string>(HOSPITALITY_KINDS);

/** Is this POI one of the hospitality kinds (food/drink/picnic)? */
function isHospitality(p: PoiFeature): boolean {
  return HOSPITALITY_SET.has(p.properties.kind);
}

/**
 * Is `point` within `clipM` of any anchor? The anchors are the trail network's
 * coordinates (every segment polyline point) plus its baked access points.
 * Early-exits on the first anchor in range.
 */
export function withinOfNetwork(
  point: [number, number],
  anchors: [number, number][],
  clipM = HOSPITALITY_CLIP_M,
): boolean {
  for (const a of anchors) {
    if (haversine(point, a) <= clipM) return true;
  }
  return false;
}

/**
 * Every coordinate the network occupies: each segment's full polyline (which
 * already includes its endpoint vertices) plus each vertex's nearest access
 * point, so a restaurant by the trailhead parking survives even when the parking
 * itself sits a little off-trail.
 */
export function networkAnchors(graph: SegmentGraph): [number, number][] {
  const anchors: [number, number][] = [];
  for (const e of graph.edges) for (const c of e.coordinates) anchors.push(c);
  for (const v of graph.vertices) if (v.access) anchors.push([v.access.lon, v.access.lat]);
  return anchors;
}

/**
 * Extract the hospitality POIs and keep only those within `clipM` of the trail
 * network. Returns a compact context-POI list (no OSM ids — these are never
 * referenced by key, only drawn), deduped by rounded position + kind so a
 * restaurant mapped as both a node and a way doesn't double up.
 */
export function clipToNetwork(
  pois: PoiFeature[],
  graph: SegmentGraph,
  clipM = HOSPITALITY_CLIP_M,
): HospitalityPoi[] {
  const anchors = networkAnchors(graph);
  const out: HospitalityPoi[] = [];
  const seen = new Set<string>();
  for (const p of pois) {
    if (!isHospitality(p)) continue;
    const [lon, lat] = p.geometry.coordinates;
    if (!withinOfNetwork([lon, lat], anchors, clipM)) continue;
    const dedupe = `${p.properties.kind}@${lon.toFixed(5)},${lat.toFixed(5)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const poi: HospitalityPoi = { lon, lat, kind: p.properties.kind as HospitalityKind };
    if (p.properties.name) poi.name = p.properties.name;
    out.push(poi);
  }
  return out;
}
