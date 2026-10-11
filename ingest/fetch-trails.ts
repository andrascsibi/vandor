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
  BUDA_HILLS_BBOX,
  buildHikingRoutesQuery,
  osmToGeoJson,
  type OverpassResponse,
} from "./overpass.ts";

// Public Overpass mirrors, tried in order — any one of them is frequently busy
// (returns a 504/429 dispatcher timeout), so we fall through to the next.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../raw/trails.geojson");

async function queryOverpass(query: string): Promise<OverpassResponse> {
  let lastErr: unknown;
  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Overpass rejects requests without a User-Agent (HTTP 406).
          "User-Agent": "vandor-hike-suggester/0.0 (personal project; github.com/andras)",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
      }
      console.log(`  via ${url}`);
      return (await res.json()) as OverpassResponse;
    } catch (err) {
      console.warn(`  mirror failed (${url}): ${(err as Error).message}`);
      lastErr = err;
    }
  }
  throw new Error(`all Overpass mirrors failed; last error: ${(lastErr as Error)?.message}`);
}

async function main(): Promise<void> {
  const query = buildHikingRoutesQuery(BUDA_HILLS_BBOX);
  console.log("Querying Overpass for Buda-hills official marked-trail ways…");
  console.log(query);

  const json = await queryOverpass(query);
  const fc = osmToGeoJson(json);

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(fc, null, 2) + "\n", "utf8");

  const colours = new Set(fc.features.flatMap((f) => f.properties.colours));
  console.log(`Wrote ${fc.features.length} marked-trail ways → ${OUT_PATH}`);
  console.log(`  colours present: ${[...colours].sort().join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
