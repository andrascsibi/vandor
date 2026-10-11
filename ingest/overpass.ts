// Pure, offline Overpass helpers: build the query for Hungary's official marked
// hiking trails (jelzett turistaút) and convert the raw Overpass JSON into a
// GeoJSON FeatureCollection. No network, no filesystem, no DOM — that lives in
// fetch-trails.ts so this stays unit-testable.
//
// "Official" = a way that belongs to a `route=hiking` relation. Those relations
// carry the colored waymark (`osmc:symbol`, e.g. "blue:white:blue_circle") and a
// mark code in the name ("K↺", "S▲"). We keep only member ways and annotate each
// with its colour(s) and marking(s); everything else (random park paths, etc.)
// is dropped.

/** Bounding box in [south, west, north, east] order (Overpass convention). */
export type BBox = readonly [south: number, west: number, north: number, east: number];

/**
 * Buda hills slice for T1–T3: covers Hárs-hegy, János-hegy and Hármashatár-hegy.
 * Deliberately small — the thin vertical slice over the real marked-trail net.
 */
export const BUDA_HILLS_BBOX: BBox = [47.51, 18.94, 47.57, 19.0];

/**
 * Build the Overpass QL query for official marked-trail ways inside a bbox:
 * select hiking-route relations, then their member ways clipped to the bbox
 * (with geometry + node ids), plus the relations themselves (tags + members)
 * so the colour/marking can be joined onto each way.
 */
export function buildHikingRoutesQuery(bbox: BBox, timeoutSec = 180): string {
  const [s, w, n, e] = bbox;
  const b = `${s},${w},${n},${e}`;
  return [
    `[out:json][timeout:${timeoutSec}];`,
    `rel["route"="hiking"](${b})->.r;`,
    // member ways, clipped to the bbox (national routes would otherwise pull the
    // whole country). `out geom` gives coords AND the node id list T2 needs.
    `way(r.r)(${b});`,
    `out geom;`,
    // the relations themselves: tags (osmc:symbol, name) + member list to join.
    `.r out body;`,
  ].join("\n");
}

// --- Overpass JSON shapes (only the fields we rely on) ---

interface OverpassGeomPoint {
  lat: number;
  lon: number;
}

interface OverpassMember {
  type: string;
  ref: number;
  role: string;
}

interface OverpassElement {
  type: string;
  id: number;
  nodes?: number[];
  geometry?: OverpassGeomPoint[];
  tags?: Record<string, string>;
  members?: OverpassMember[];
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
  /** Way name (often a street/path name), if any. */
  name?: string;
  /** OSM highway tag of the way. */
  highway?: string;
  /** Distinct waymark colours of the route(s) this way belongs to (e.g. "blue"). */
  colours: string[];
  /** Distinct Hungarian mark codes of the route(s) (e.g. "K↺", "S▲"). */
  markings: string[];
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

interface RouteInfo {
  colour?: string;
  marking?: string;
}

/** Extract waymark colour + Hungarian mark code from a route relation's tags. */
function parseRoute(tags: Record<string, string>): RouteInfo {
  const symbol = tags["osmc:symbol"];
  // osmc:symbol = "waycolour:background:foreground…" — the waycolour is the band.
  let colour = symbol ? symbol.split(":")[0].trim().toLowerCase() : "";
  if (!colour && tags.colour) colour = tags.colour.trim().toLowerCase();
  // Mark code: prefer `ref`, else the leading token of the name ("K↺ (Normafa …)").
  const name = tags.name ?? "";
  const marking = (tags.ref ?? "").trim() || name.split(" (")[0].trim();
  return { colour: colour || undefined, marking: marking || undefined };
}

const distinct = (xs: (string | undefined)[]): string[] =>
  [...new Set(xs.filter((x): x is string => !!x))].sort();

/**
 * Convert an Overpass response into a GeoJSON FeatureCollection of official
 * marked-trail LineStrings. Only ways that are members of a `route=hiking`
 * relation are kept; each is annotated with its route colour(s) and marking(s).
 * Ways with fewer than two geometry points are dropped.
 */
export function osmToGeoJson(response: OverpassResponse): TrailFeatureCollection {
  // 1. Index route colour/marking by member way id.
  const routesByWay = new Map<number, RouteInfo[]>();
  for (const el of response.elements) {
    if (el.type !== "relation" || el.tags?.route !== "hiking") continue;
    const info = parseRoute(el.tags);
    for (const m of el.members ?? []) {
      if (m.type !== "way") continue;
      const list = routesByWay.get(m.ref);
      if (list) list.push(info);
      else routesByWay.set(m.ref, [info]);
    }
  }

  // 2. Emit member ways with geometry, annotated; drop non-member ways.
  const features: TrailFeature[] = [];
  for (const el of response.elements) {
    if (el.type !== "way") continue;
    const geometry = el.geometry;
    if (!geometry || geometry.length < 2) continue;
    const routes = routesByWay.get(el.id);
    if (!routes || routes.length === 0) continue; // not official → drop

    const properties: TrailProperties = {
      osmid: el.id,
      nodes: el.nodes ?? [],
      colours: distinct(routes.map((r) => r.colour)),
      markings: distinct(routes.map((r) => r.marking)),
    };
    if (el.tags?.name) properties.name = el.tags.name;
    if (el.tags?.highway) properties.highway = el.tags.highway;

    features.push({
      type: "Feature",
      id: el.id,
      geometry: {
        type: "LineString",
        coordinates: geometry.map((p): [number, number] => [p.lon, p.lat]),
      },
      properties,
    });
  }

  return { type: "FeatureCollection", features };
}
