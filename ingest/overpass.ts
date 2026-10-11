// Pure, offline Overpass helpers: build the trail query and convert the raw
// Overpass JSON into a GeoJSON FeatureCollection. No network, no filesystem,
// no DOM — all of that lives in fetch-trails.ts so this stays unit-testable.

/** Bounding box in [south, west, north, east] order (Overpass convention). */
export type BBox = readonly [south: number, west: number, north: number, east: number];

/**
 * Buda hills slice for T1: covers Hárs-hegy, János-hegy and Hármashatár-hegy.
 * Deliberately small — the thin vertical slice to prove ingest end to end.
 */
export const BUDA_HILLS_BBOX: BBox = [47.51, 18.94, 47.57, 19.0];

/**
 * Hiking-road way tags we treat as trail substrate (per ARCHITECTURE.md).
 * Routes/relations and POIs come later (T4); T1 is ways only.
 */
export const TRAIL_HIGHWAYS = ["path", "footway", "track", "steps"] as const;

/** Build the Overpass QL query for trail ways inside a bbox. */
export function buildTrailsQuery(bbox: BBox, timeoutSec = 90): string {
  const [s, w, n, e] = bbox;
  const bboxStr = `${s},${w},${n},${e}`;
  const highways = TRAIL_HIGHWAYS.join("|");
  return [
    `[out:json][timeout:${timeoutSec}];`,
    `way["highway"~"^(${highways})$"](${bboxStr});`,
    // `out geom` gives us both inline coordinates AND the node id list per way,
    // which the T2 graph builder needs to split at shared junction nodes.
    `out geom;`,
  ].join("\n");
}

// --- Overpass JSON shapes (only the fields we rely on) ---

interface OverpassGeomPoint {
  lat: number;
  lon: number;
}

interface OverpassWay {
  type: "way";
  id: number;
  nodes?: number[];
  geometry?: OverpassGeomPoint[];
  tags?: Record<string, string>;
}

interface OverpassElement {
  type: string;
  id: number;
  nodes?: number[];
  geometry?: OverpassGeomPoint[];
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

// --- GeoJSON output shapes ---

export interface TrailProperties {
  /** OSM way id, kept so the graph builder and share links can reference it. */
  osmid: number;
  /** OSM node ids aligned 1:1 with the LineString coordinates (for junctions). */
  nodes: number[];
  /** Pass-through OSM tags (highway, name, surface, …). */
  [tag: string]: string | number | number[];
}

export interface TrailFeature {
  type: "Feature";
  id: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: TrailProperties;
}

export interface TrailFeatureCollection {
  type: "FeatureCollection";
  features: TrailFeature[];
}

/**
 * Convert an Overpass `out geom` response into a GeoJSON FeatureCollection of
 * trail LineStrings. Ways with fewer than two geometry points are dropped —
 * they cannot form an edge.
 */
export function osmToGeoJson(response: OverpassResponse): TrailFeatureCollection {
  const features: TrailFeature[] = [];

  for (const el of response.elements) {
    if (el.type !== "way") continue;
    const way = el as OverpassWay;
    const geometry = way.geometry;
    if (!geometry || geometry.length < 2) continue;

    const coordinates = geometry.map(
      (p): [number, number] => [p.lon, p.lat],
    );

    features.push({
      type: "Feature",
      id: way.id,
      geometry: { type: "LineString", coordinates },
      properties: {
        ...way.tags,
        osmid: way.id,
        nodes: way.nodes ?? [],
      },
    });
  }

  return { type: "FeatureCollection", features };
}
