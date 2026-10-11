# Vándor — Architecture

> Random hike suggester for the Budapest Sunday *kirándulás*. Single user (Andras).
> Start location hardcoded: **Budapest, Széll Kálmán tér**. Range: ~1h (Greater Budapest).

## Core model: the trail graph

A **hike** is a *route*. The thing we pick at random is a **segment** (an edge).

- **Vertex** = a POI: a trail junction, a road/river crossing, or a named feature
  (peak, spring, saddle, viewpoint, shelter, bus stop, parking).
- **Edge (segment)** = a maximal stretch of hiking road between two consecutive
  vertices, with no vertex in between. Carries geometry (polyline), length, and
  later: elevation profile + metadata.
- Built by **edge contraction**: load trail ways, split at shared/junction nodes,
  contract degree-2 chains. **50m rule:** never introduce a vertex that would
  create a sub-50m edge — attach that POI to the nearest existing vertex instead.

## Data source

- **Substrate = OpenStreetMap.** Freely bulk-downloadable, contains the full trail
  graph (`highway=path|footway|track|steps`, `route=hiking` relations), shared
  nodes = junctions, and the Hungarian *jelzett turistaút* network + POIs
  (`natural=peak|spring|saddle`, `tourism=viewpoint`, `amenity=shelter|parking`,
  `highway=bus_stop`).
  - MVP ingest via **Overpass API** (bbox + tag filter — no heavy toolchain).
  - Scale path if we outgrow Overpass: Geofabrik Hungary `.osm.pbf` + osmium.
- **Mapy = consumer, not source.** Used for: share deep-links (start/end points)
  and optionally outdoor tiles (API-key gated).
- **Tiles (map UI):** OpenTopoMap (topographic, hiking-appropriate, no key).
- **Elevation (later):** sample a DEM (Copernicus/SRTM) along segment polylines.

## Pipeline (separation of concerns)

```
[1 INGEST] offline, batch        OSM (Overpass) ──▶ raw/trails.geojson  (cacheable, rerun occasionally)
                                       │
[2 GRAPH]  offline, pure         raw ──▶ build segment graph ──▶ data/segments.json   (vertices[], edges[])
                                       │                                  ▲ TDD core — pure transform
[3 ENRICH] offline, incremental  segments + {DEM, transit, reviews} ──▶ adds fields    (one enricher per pass)
                                       │
       ┌───────────────────────────────┴───────────────────────────────┐
[4 PICKER/UI] Vite+Leaflet                                   [5 PLANNER] pure module + UI
 load segments.json → random edge →                          given a segment, build the trip:
 highlight on map → Mapy share link                           access point + route + logistics
```

Four concerns, each independently buildable/testable, mirroring Andras's framing:
1. **Ingest** — download hiking roads.
2. **Graph build** — turn roads into a segment DB (pure, the intellectual core).
3. **Picker + map UI** — pick & visualise a random segment (the first user-facing app).
4. **Trip planner** — plan the full itinerary around a segment (grows in sophistication).
   - v0: nearest parking/bus stop + out-and-back circuit touching the segment.
   - v1: transit-aware — start ≠ end allowed when going by bus.
   - v2: optimise car duration, hike length (~5–10 km), elevation, **awesomeness**.
5. **Awesomeness black box** — metadata scoring: accessibility, user rating,
   AI-informed score from written reviews. Deliberately deferred; a scored field
   the planner reads.

## Conventions (inherited from kertiteto)

- Vanilla **TS + Vite + Vitest**, minimal deps. TDD on pure modules.
- `ingest/` and `graph/` are pure/offline (no DOM); `app/` is the Leaflet UI.
- Geo: GeoJSON `[lon, lat]`. Lengths via haversine.
- Ship often — every backlog task produces something useful or testable on its own.
