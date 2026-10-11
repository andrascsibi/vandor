// Rerunnable graph build (T2). Reads raw/trails.geojson (from T1 ingest) and
// writes data/segments.json — the segment DB the picker UI (T3) consumes.
//
//   npm run graph
//
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TrailFeatureCollection } from "../ingest/overpass.ts";
import { buildSegmentGraph } from "./graph.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN_PATH = resolve(__dirname, "../raw/trails.geojson");
const OUT_PATH = resolve(__dirname, "../data/segments.json");

async function main(): Promise<void> {
  const fc = JSON.parse(await readFile(IN_PATH, "utf8")) as TrailFeatureCollection;
  console.log(`Read ${fc.features.length} trail ways from ${IN_PATH}`);

  const graph = buildSegmentGraph(fc);

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
