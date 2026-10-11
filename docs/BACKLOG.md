# Vándor — Backlog

Granularity rule: **each task ships a standalone product** — useful or at least
testable on its own — because we burn the daily token quota and want to never
lose work mid-flight. Ordered for earliest *visible* value over the real substrate.

## Thin vertical slice → working app by Task 3

- [x] **T1 · Ingest (1 area).** Overpass query for a small bbox (Buda hills:
  Hárs-hegy / János-hegy / Hármashatár-hegy): **official marked trails only** —
  ways that are members of `route=hiking` relations, annotated with the waymark
  colour + mark code (osmc:symbol) → `raw/trails.geojson`, via a rerunnable script.
  *Product:* a real data file + reproducible fetch. *Testable:* way count sane,
  every way has a colour + marking, OKT present.

- [x] **T2 · Graph builder.** Pure transform: ways → segment graph (split at junction
  nodes, contract degree-2 chains, 50m merge rule, haversine lengths) → `data/segments.json`.
  *Product:* the segment DB. *Testable:* unit tests on topology (junction → vertex,
  sub-50m merge, edge count), golden file.

- [x] **T3 · Map UI MVP.** Vite + Leaflet + OpenTopoMap. Load `segments.json`,
  "🎲 Vándor dob" button highlights a random edge, show its two POI endpoints,
  "Nyisd meg Mapyn" share link. *Product:* **the app you open Sunday morning** —
  the original brief, backed by real data. Puzzle mode = just this.

## Deepen the data

- [ ] **T4 · Full region ingest + POI vertices.** Expand bbox to ~1h / Greater
  Budapest; add named POIs as vertices (peaks, springs, saddles, viewpoints,
  shelters, bus stops, parking). *Product:* richer, better random picks.

- [ ] **T5 · Elevation enrichment.** Sample a DEM along each segment → store
  profile + gain/loss/max grade. *Product:* segments gain difficulty signal.

## Trip planner ("reveal awesomest itinerary")

- [ ] **T6 · Planner v0.** Given a segment, find nearest access point (parking/bus
  stop vertex) and build an out-and-back circuit touching the segment.
  *Product:* basic itinerary + vehicle/parking guess + total km.

- [ ] **T7 · Planner v1 (transit-aware).** Allow start ≠ end when reachable by
  bus/cogwheel/chairlift; prefer public transport where sensible.

- [ ] **T8 · Planner v2 (optimiser).** Score candidate itineraries on car duration,
  hike length (~5–10 km), elevation, and awesomeness; return the best.

## Awesomeness (the black box)

- [ ] **T9 · Metadata layer.** Attach accessibility + user rating fields to segments.
- [ ] **T10 · AI awesomeness score.** LLM over written reviews/descriptions →
  per-segment awesomeness score the optimiser reads. The "LEAN proof of awesomestness"
  lives here (show the reasoning/evidence behind the score).

## Later / nice-to-have

- [ ] URL/hash state so a chosen segment is shareable/bookmarkable (kertiteto pattern).
- [ ] "Already done" memory so random avoids recent repeats.
- [ ] Kid-excitement signals (castles, ruins, lookout towers, caves, buffet huts).
