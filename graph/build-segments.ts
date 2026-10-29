// Rerunnable graph build (T2). Reads raw/trails.geojson (from T1 ingest) and
// writes data/segments.json — the segment DB the picker UI (T3) consumes.
//
//   npm run graph
//
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TrailFeatureCollection } from "../ingest/overpass.ts";
import { NAMING_KINDS, type PoiFeature, type PoiFeatureCollection } from "../ingest/pois.ts";
import { makeSampler, parseHgt, type HgtTile } from "../ingest/dem.ts";
import { buildSegmentGraph, dedupeEdgeKeys, type SegmentGraph } from "./graph.ts";
import { attachPois } from "./attach-pois.ts";
import { attachAccess, usableParking } from "./attach-access.ts";
import { attachElevation, elevationCoverage, elevationSummary } from "./attach-elevation.ts";
import { clipToNetwork, HOSPITALITY_CLIP_M } from "./attach-hospitality.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN_PATH = resolve(__dirname, "../raw/trails.geojson");
const POI_PATH = resolve(__dirname, "../raw/pois.geojson");
const DEM_DIR = resolve(__dirname, "../raw/dem");
const OUT_PATH = resolve(__dirname, "../data/segments.json");
const HOSPITALITY_PATH = resolve(__dirname, "../data/hospitality.json");

/**
 * Load every `.hgt` tile in raw/dem/ (if any). The file name N47E018 encodes the
 * SW-corner lat/lon the sampler needs. Returns [] when the dir is absent or empty
 * — the DEM ingest (`npm run dem`) is optional, exactly like the POI ingest, so a
 * fresh checkout still builds a graph (without elevation) and `npm run test` is green.
 */
async function loadDemTiles(): Promise<HgtTile[]> {
  let names: string[];
  try {
    names = (await readdir(DEM_DIR)).filter((n) => n.endsWith(".hgt"));
  } catch {
    return [];
  }
  const tiles: HgtTile[] = [];
  for (const name of names) {
    const m = /^([NS])(\d{2})([EW])(\d{3})\.hgt$/.exec(name);
    if (!m) continue;
    const lat = (m[1] === "S" ? -1 : 1) * Number(m[2]);
    const lon = (m[3] === "W" ? -1 : 1) * Number(m[4]);
    tiles.push(parseHgt(new Uint8Array(await readFile(resolve(DEM_DIR, name))), lat, lon));
  }
  return tiles;
}

async function main(): Promise<void> {
  const fc = JSON.parse(await readFile(IN_PATH, "utf8")) as TrailFeatureCollection;
  console.log(`Read ${fc.features.length} trail ways from ${IN_PATH}`);

  const base = buildSegmentGraph(fc);

  // Load POIs once (T4b naming + T6 access).
  let allPois: PoiFeature[] = [];
  try {
    const poiFc = JSON.parse(await readFile(POI_PATH, "utf8")) as PoiFeatureCollection;
    allPois = poiFc.features;
    console.log(`Read ${allPois.length} POIs from ${POI_PATH}`);
  } catch {
    console.warn(`No ${POI_PATH} (run \`npm run pois\`); building without POIs.`);
  }

  // T4b: attach named POIs (peaks/saddles/viewpoints/springs/shelters) as
  // segment endpoints — naming junctions and splitting edges mid-trail.
  const naming = new Set<string>(NAMING_KINDS);
  const namingPois = allPois.filter((p) => naming.has(p.properties.kind) && p.properties.name);
  const withPois = attachPois(base, namingPois);
  const named = withPois.vertices.filter((v) => v.name).length;
  const split = withPois.vertices.length - base.vertices.length;
  console.log(
    `  attached ${namingPois.length} named POIs → ${named} named vertices (${split} new from edge splits)`,
  );

  // T6: bake each endpoint's nearest usable car parking (crow-flies) as `access`.
  const parking = usableParking(allPois);
  const graph = attachAccess(withPois, parking);

  // Ensure every segment's stable key is unique across the final graph, so the
  // walk profile (which keys on it) can never conflate two segments.
  dedupeEdgeKeys(graph.edges);
  const withAccess = graph.vertices.filter((v) => v.access).length;
  console.log(
    `  ${parking.length} usable parking → ${withAccess}/${graph.vertices.length} vertices got an access point`,
  );

  // T12d: bake per-segment elevation (gain/loss/grade) from the DEM, if its tiles
  // are present (`npm run dem`). Optional — a checkout without them still builds.
  const tiles = await loadDemTiles();
  let graphWithEle: SegmentGraph = graph;
  if (tiles.length) {
    graphWithEle = attachElevation(graph, makeSampler(tiles));
    const cov = elevationCoverage(graphWithEle);
    const sum = elevationSummary(graphWithEle);
    console.log(
      `  ${tiles.length} DEM tile(s) → elevation on ${cov.withEle}/${cov.total} segments ` +
        `(median grade ${sum.medianGrade.toFixed(1)}%, steepest ${sum.maxGrade.toFixed(1)}%` +
        `${sum.steepest?.name ? ` on "${sum.steepest.name}"` : ""})`,
    );
  } else {
    console.warn(`No ${DEM_DIR} tiles (run \`npm run dem\`); building without elevation.`);
  }

  const lengths = graphWithEle.edges.map((e) => e.lengthM).sort((a, b) => a - b);
  const total = lengths.reduce((s, l) => s + l, 0);
  const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0;

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(graphWithEle) + "\n", "utf8");

  console.log(
    `Wrote ${graphWithEle.vertices.length} vertices, ${graphWithEle.edges.length} segments → ${OUT_PATH}`,
  );
  console.log(
    `  total trail ${(total / 1000).toFixed(1)} km · median segment ${median} m`,
  );

  // T12b: the 🍷 kultúrista overlay. Hospitality is a context-POI, not a graph
  // vertex — extract it from the shared ingest and clip to within ~600 m of the
  // trail network, so the committed set is small and hegyvidéki.
  const hospitality = clipToNetwork(allPois, graph);
  await writeFile(HOSPITALITY_PATH, JSON.stringify({ pois: hospitality }) + "\n", "utf8");
  const byHosp: Record<string, number> = {};
  for (const p of hospitality) byHosp[p.kind] = (byHosp[p.kind] ?? 0) + 1;
  console.log(
    `  ${hospitality.length} hospitality POIs within ${HOSPITALITY_CLIP_M} m of the net → ${HOSPITALITY_PATH}`,
  );
  console.log(`  by kind: ${JSON.stringify(byHosp)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
