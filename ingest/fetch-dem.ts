// Rerunnable DEM ingest (T12d, the 🩸 faj-turista lens). Downloads the raw SRTM
// 1-arcsec `.hgt` tiles covering the segment network from the AWS open-data
// "elevation-tiles-prod" skadi mirror — no API key, no auth, just gzipped raw
// int16 tiles (the exact format docs/TURISTA-LENSES.md calls for). Decompressed
// with Node's built-in zlib, so this stays zero-dependency.
//
//   npm run dem
//
// The tiles are large (~25 MB each) and gitignored (raw/dem/); only the derived
// per-segment metrics get committed, baked into data/segments.json by `npm run graph`.
import { gunzipSync } from "node:zlib";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tilesForBounds } from "./dem.ts";
import type { SegmentGraph } from "../graph/graph.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEGMENTS_PATH = resolve(__dirname, "../data/segments.json");
const OUT_DIR = resolve(__dirname, "../raw/dem");

// AWS open-data mirror of SRTM, "skadi" layout: /skadi/<Nxx>/<tile>.hgt.gz.
const SKADI_BASE = "https://s3.amazonaws.com/elevation-tiles-prod/skadi";

/** Bounding box of every segment coordinate — the exact DEM footprint we need. */
function networkBounds(graph: SegmentGraph) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const e of graph.edges) {
    for (const [lon, lat] of e.coordinates) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return { west, south, east, north };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const graph = JSON.parse(await readFile(SEGMENTS_PATH, "utf8")) as SegmentGraph;
  const bounds = networkBounds(graph);
  const keys = tilesForBounds(bounds);
  console.log(
    `Network bbox lon [${bounds.west.toFixed(3)}, ${bounds.east.toFixed(3)}] ` +
      `lat [${bounds.south.toFixed(3)}, ${bounds.north.toFixed(3)}] → ${keys.length} tile(s): ${keys.join(", ")}`,
  );

  await mkdir(OUT_DIR, { recursive: true });
  for (const key of keys) {
    const outPath = resolve(OUT_DIR, `${key}.hgt`);
    if (await exists(outPath)) {
      console.log(`  ${key}: already present, skipping`);
      continue;
    }
    const ns = key.slice(0, 3); // "N47"
    const url = `${SKADI_BASE}/${ns}/${key}.hgt.gz`;
    process.stdout.write(`  ${key}: downloading ${url} … `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${key}: HTTP ${res.status} from ${url}`);
    const gz = new Uint8Array(await res.arrayBuffer());
    const hgt = gunzipSync(gz);
    await writeFile(outPath, hgt);
    console.log(`${(gz.length / 1e6).toFixed(1)} MB → ${(hgt.length / 1e6).toFixed(1)} MB raw`);
  }
  console.log(`Done. Tiles in ${OUT_DIR} (gitignored). Run \`npm run graph\` to bake metrics.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
