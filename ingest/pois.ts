// Pure, offline Overpass helpers for named POIs (T4b). Peaks, springs, saddles,
// viewpoints and shelters give trail segments *meaningful named endpoints*; bus
// stops and parking are access points the planner (T6) will consume. No network,
// no filesystem, no DOM — that lives in fetch-pois.ts so this stays unit-testable.
//
// Same region as the trails (bboxAround Széll Kálmán tér → clip to radius); here
// we build the Overpass query and convert the raw node/way elements into a
// GeoJSON Point FeatureCollection annotated with a POI `kind`.

import type { BBox } from "./overpass.ts";

/** Structural POI categories, in attach-priority order (most "nameable" first). */
const STRUCTURAL_KINDS = [
  "peak",
  "saddle",
  "viewpoint",
  "spring",
  "shelter",
  "parking",
  "bus_stop",
] as const;

/**
 * Hospitality categories (T12b, the 🍷 kultúrista overlay). These are
 * *context-POIs*, never graph vertices — they ride in the same ingest but are
 * extracted and clipped to the trail network separately (graph/attach-hospitality).
 */
export const HOSPITALITY_KINDS = ["food", "drink", "picnic"] as const;
export type HospitalityKind = (typeof HOSPITALITY_KINDS)[number];

/** Every POI category we ingest (structural endpoints/access + hospitality). */
export const POI_KINDS = [...STRUCTURAL_KINDS, ...HOSPITALITY_KINDS] as const;
export type PoiKind = (typeof POI_KINDS)[number];

/** Named POIs worth showing as a segment endpoint (vs. access-only POIs). */
export const NAMING_KINDS: readonly PoiKind[] = [
  "peak",
  "saddle",
  "viewpoint",
  "spring",
  "shelter",
];

export interface PoiProperties {
  /** OSM element id (node or way). */
  osmid: number;
  /** OSM element type the POI came from. */
  osmType: "node" | "way";
  kind: PoiKind;
  name?: string;
  /** Elevation in metres, if tagged (peaks/saddles). */
  ele?: number;
  /** OSM `access` value (e.g. "private", "customers", "yes") — mainly parking. */
  access?: string;
}

export interface PoiFeature {
  type: "Feature";
  id: number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: PoiProperties;
}

export interface PoiFeatureCollection {
  type: "FeatureCollection";
  features: PoiFeature[];
}

// --- Overpass JSON shapes (only what we rely on) ---
interface OverpassCenter {
  lat: number;
  lon: number;
}
interface OverpassPoiElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: OverpassCenter;
  tags?: Record<string, string>;
}
export interface OverpassPoiResponse {
  elements: OverpassPoiElement[];
}

/**
 * Build the Overpass QL query for the POI set inside a bbox. Nodes for the
 * point-like features; nodes AND ways (with `out center`) for shelter/parking,
 * which are often mapped as areas. The bbox is the square bounding the range
 * circle — fetch-pois.ts clips to the exact radius afterwards.
 */
export function buildPoiQuery(bbox: BBox, timeoutSec = 180): string {
  const [s, w, n, e] = bbox;
  const b = `${s},${w},${n},${e}`;
  const node = (sel: string) => `  node${sel}(${b});`;
  const way = (sel: string) => `  way${sel}(${b});`;
  return [
    `[out:json][timeout:${timeoutSec}];`,
    "(",
    node('["natural"="peak"]'),
    node('["natural"="saddle"]'),
    node('["natural"="spring"]'),
    node('["tourism"="viewpoint"]'),
    node('["amenity"="shelter"]'),
    way('["amenity"="shelter"]'),
    node('["amenity"="parking"]'),
    way('["amenity"="parking"]'),
    node('["highway"="bus_stop"]'),
    // Hospitality (T12b): where a turista eats/drinks. Nodes AND ways — a
    // restaurant or biergarten is commonly mapped as a building/area.
    node('["amenity"="restaurant"]'),
    way('["amenity"="restaurant"]'),
    node('["amenity"="cafe"]'),
    way('["amenity"="cafe"]'),
    node('["amenity"="fast_food"]'),
    way('["amenity"="fast_food"]'),
    node('["amenity"="pub"]'),
    way('["amenity"="pub"]'),
    node('["amenity"="bar"]'),
    way('["amenity"="bar"]'),
    node('["amenity"="biergarten"]'),
    way('["amenity"="biergarten"]'),
    node('["tourism"="picnic_site"]'),
    way('["tourism"="picnic_site"]'),
    ");",
    // `out center` gives node coords directly and a center point for ways/areas.
    "out center;",
  ].join("\n");
}

/**
 * Classify hospitality tags into a HospitalityKind, or undefined. Eat-out
 * amenities are `food`, drink-led ones `drink`, and picnic sites `picnic`.
 * Pure and exported so the mapping is unit-testable (T12b).
 */
export function classifyHospitality(
  tags: Record<string, string>,
): HospitalityKind | undefined {
  switch (tags.amenity) {
    case "restaurant":
    case "fast_food":
      return "food";
    case "cafe":
    case "pub":
    case "bar":
    case "biergarten":
      return "drink";
  }
  if (tags.tourism === "picnic_site") return "picnic";
  return undefined;
}

/** Classify an element's tags into a PoiKind (priority order), or undefined. */
function classify(tags: Record<string, string>): PoiKind | undefined {
  if (tags.natural === "peak") return "peak";
  if (tags.natural === "saddle") return "saddle";
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.natural === "spring") return "spring";
  if (tags.amenity === "shelter") return "shelter";
  if (tags.amenity === "parking") return "parking";
  if (tags.highway === "bus_stop") return "bus_stop";
  return classifyHospitality(tags);
}

/** Parse an elevation tag ("432", "432 m") to a number, or undefined. */
function parseEle(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseFloat(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Convert an Overpass POI response into a GeoJSON Point FeatureCollection.
 * Nodes use their own lat/lon; ways use the `center`. Elements we can't classify
 * or locate are dropped.
 */
export function poisToGeoJson(response: OverpassPoiResponse): PoiFeatureCollection {
  const features: PoiFeature[] = [];
  for (const el of response.elements) {
    if (el.type !== "node" && el.type !== "way") continue;
    const tags = el.tags;
    if (!tags) continue;
    const kind = classify(tags);
    if (!kind) continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat === undefined || lon === undefined) continue;

    const properties: PoiProperties = { osmid: el.id, osmType: el.type, kind };
    if (tags.name) properties.name = tags.name;
    const ele = parseEle(tags.ele);
    if (ele !== undefined) properties.ele = ele;
    if (tags.access) properties.access = tags.access;

    features.push({
      type: "Feature",
      id: el.id,
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties,
    });
  }
  return { type: "FeatureCollection", features };
}
