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

## Run it

```
npm install
npm run dev      # the app at http://localhost:5173
npm test         # 35 tests
npm run build    # static site → dist/ (deployed to GitHub Pages on push to main)
```

Data pipeline (rerun occasionally, output is committed):

```
npm run ingest   # Overpass → raw/trails.geojson
npm run graph    # raw → data/segments.json (the segment DB)
```

_Status: T3 done — the picker app ships. Press **🎲 Vándor dob** for a random
**official marked-trail** (jelzett turistaút) segment, drawn in its real waymark
colour (kék / piros / zöld / sárga…) on an OpenTopoMap, with a Mapy.com
hiking-route share link. Ingest keeps only ways in `route=hiking` relations.
Next: T4 full-region ingest + POI vertices. See backlog._
