// Rerunnable POI ingest (T4b). Fetches named POIs (peaks, springs, saddles,
// viewpoints, shelters) + access POIs (parking, bus stops) for the range bbox
// from Overpass, clips to the exact 20 km radius, and writes raw/pois.geojson.
//
//   npm run pois
//
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VANDOR_CENTER,
  RANGE_RADIUS_M,
  bboxAround,
  haversineM,
} from "./overpass.ts";
import { buildPoiQuery, poisToGeoJson, type OverpassPoiResponse } from "./pois.ts";
import { queryOverpass } from "./overpass-client.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../raw/pois.geojson");

async function main(): Promise<void> {
  const radiusKm = RANGE_RADIUS_M / 1000;
  const bbox = bboxAround(VANDOR_CENTER, RANGE_RADIUS_M);
  const query = buildPoiQuery(bbox);
  console.log(`Querying Overpass for POIs within ${radiusKm} km of Széll Kálmán tér…`);
  console.log(query);

  const json = await queryOverpass<OverpassPoiResponse>(query);
  const bboxFc = poisToGeoJson(json);
  // Rectangular fetch → exact circular range cut.
  const features = bboxFc.features.filter(
    (f) => haversineM(f.geometry.coordinates, VANDOR_CENTER) <= RANGE_RADIUS_M,
  );
  const fc = { type: "FeatureCollection" as const, features };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(fc, null, 2) + "\n", "utf8");

  const byKind: Record<string, number> = {};
  for (const f of fc.features) byKind[f.properties.kind] = (byKind[f.properties.kind] ?? 0) + 1;
  console.log(
    `  ${bboxFc.features.length} POIs in bbox → ${fc.features.length} within ${radiusKm} km`,
  );
  console.log(`Wrote ${fc.features.length} POIs → ${OUT_PATH}`);
  console.log(`  by kind: ${JSON.stringify(byKind)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
