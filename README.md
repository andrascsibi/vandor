# Vándor 🧭

Random hike suggester for the Budapest Sunday *kirándulás*. Open it on a hungover
Sunday morning, press the button, get a trail segment to go walk. Single user.

- Start location: **Budapest, Széll Kálmán tér** (hardcoded).
- Range: ~1h, Greater Budapest.
- Persona driving the build: **Vándor** ("wanderer").

## Idea in one line

A hike is a *route*. We pick a random **segment** (an edge in the hiking-trail
graph) and plan the awesomest trip that walks it.

## Docs

- [Architecture](docs/ARCHITECTURE.md) — the trail graph, data source, pipeline.
- [Backlog](docs/BACKLOG.md) — prioritised, ship-often tasks.

## Stack

Vanilla TS + Vite + Vitest + Leaflet. OpenStreetMap data, OpenTopoMap tiles,
Mapy.cz share links. Minimal deps.

_Status: T2 done — `npm run ingest` ships `raw/trails.geojson` (2.7k ways);
`npm run graph` contracts it into `data/segments.json` (1.1k vertices, 1.6k
segments, 307 km). Next: T3 map UI. See backlog._
