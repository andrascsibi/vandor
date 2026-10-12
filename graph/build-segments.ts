// Rerunnable graph build (T2). Reads raw/trails.geojson (from T1 ingest) and
// writes data/segments.json — the segment DB the picker UI (T3) consumes.
//
//   npm run graph
//
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TrailFeatureCollection } from "../ingest/overpass.ts";
import { NAMING_KINDS, type PoiFeatureCollection } from "../ingest/pois.ts";
import { buildSegmentGraph } from "./graph.ts";
import { attachPois } from "./attach-pois.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN_PATH = resolve(__dirname, "../raw/trails.geojson");
const POI_PATH = resolve(__dirname, "../raw/pois.geojson");
const OUT_PATH = resolve(__dirname, "../data/segments.json");

async function main(): Promise<void> {
  const fc = JSON.parse(await readFile(IN_PATH, "utf8")) as TrailFeatureCollection;
  console.log(`Read ${fc.features.length} trail ways from ${IN_PATH}`);

  const base = buildSegmentGraph(fc);

  // T4b: attach named POIs (peaks/saddles/viewpoints/springs/shelters) as
  // segment endpoints — naming junctions and splitting edges mid-trail.
  const naming = new Set<string>(NAMING_KINDS);
  let namingPois: PoiFeatureCollection["features"] = [];
  try {
    const poiFc = JSON.parse(await readFile(POI_PATH, "utf8")) as PoiFeatureCollection;
    namingPois = poiFc.features.filter((p) => naming.has(p.properties.kind) && p.properties.name);
    console.log(`Read ${poiFc.features.length} POIs (${namingPois.length} named & nameable) from ${POI_PATH}`);
  } catch {
    console.warn(`No ${POI_PATH} (run \`npm run pois\`); building without POI names.`);
  }
  const graph = attachPois(base, namingPois);
  const named = graph.vertices.filter((v) => v.name).length;
  const split = graph.vertices.length - base.vertices.length;
  console.log(`  attached POIs → ${named} named vertices (${split} new from edge splits)`);

  const lengths = graph.edges.map((e) => e.lengthM).sort((a, b) => a - b);
  const total = lengths.reduce((s, l) => s + l, 0);
  const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0;

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(graph) + "\n", "utf8");

  console.log(
    `Wrote ${graph.vertices.length} vertices, ${graph.edges.length} segments → ${OUT_PATH}`,
  );
  console.log(
    `  total trail ${(total / 1000).toFixed(1)} km · median segment ${median} m`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
