// Rerunnable ingest script (T1). Fetches trail ways for the Buda-hills bbox
// from the Overpass API and writes raw/trails.geojson. Offline-batch, cacheable:
// rerun occasionally, commit the output.
//
//   npm run ingest
//
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VANDOR_CENTER,
  RANGE_RADIUS_M,
  bboxAround,
  buildHikingRoutesQuery,
  clipToRadius,
  osmToGeoJson,
  type OverpassResponse,
} from "./overpass.ts";
import { queryOverpass } from "./overpass-client.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../raw/trails.geojson");

async function main(): Promise<void> {
  const radiusKm = RANGE_RADIUS_M / 1000;
  const bbox = bboxAround(VANDOR_CENTER, RANGE_RADIUS_M);
  const query = buildHikingRoutesQuery(bbox);
  console.log(
    `Querying Overpass for official marked-trail ways within ${radiusKm} km of Széll Kálmán tér…`,
  );
  console.log(query);

  const json = await queryOverpass<OverpassResponse>(query);
  const bboxFc = osmToGeoJson(json);
  // Rectangular fetch → exact circular range cut.
  const fc = clipToRadius(bboxFc, VANDOR_CENTER, RANGE_RADIUS_M);

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(fc, null, 2) + "\n", "utf8");

  console.log(
    `  ${bboxFc.features.length} ways in bbox → ${fc.features.length} within ${radiusKm} km`,
  );
  const colours = new Set(fc.features.flatMap((f) => f.properties.colours));
  console.log(`Wrote ${fc.features.length} marked-trail ways → ${OUT_PATH}`);
  console.log(`  colours present: ${[...colours].sort().join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
