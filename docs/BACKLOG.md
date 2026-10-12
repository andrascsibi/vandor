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

- [x] **T4a · Full-region ingest + range filter.** Region = **~20 km radius of
  Széll Kálmán tér** (a cheap MVP stand-in for "≈30 min by car"; revisit as a
  real drive-time-to-access-point check once the planner lands). Fetched via a
  bounding bbox (robust) then an exact circular `clipToRadius` cut in code —
  Overpass `(around:)` on relations 500s on the public mirrors. *Product:*
  **951 segments / 859 km** of marked trail (was 155 / 90), richer random picks.
  Colour is now optional (tanösvény / Mária-út / ST* sétaút routes carry a mark
  but no `osmc:symbol` colour → neutral fallback); a marking is still required.

- [x] **T4b · POI vertices.** Ingest POIs (`npm run pois` → `raw/pois.geojson`:
  peaks/saddles/viewpoints/springs/shelters + access POIs parking/bus_stop) and
  attach the *named* ones onto the graph (`graph/attach-pois.ts`): a POI within
  50 m of an endpoint names that vertex; a mid-trail POI splits the edge into a
  new named degree-2 vertex (60 m snap, 50 m fragment guard, kind-priority on
  conflict). *Product:* **134 named vertices** (103 from splits) → the picker
  shows "⛰️ Határ-nyereg → 🔭 Oroszlán-szikla". Access POIs wait for the planner.

## Explore the network

- [ ] **T5 · Segment network explorer (viewport).** Draw **all in-viewport
  segments** as the base layer — thin lines coloured by waymark — not just the
  one that was rolled. **Click/tap any segment → it becomes the selected
  highlight and the panel updates** (the same panel the random pick fills:
  marks, named endpoints, length, Mapy link). A hands-on, browse-the-web way to
  explore, alongside "Vándor dob". This is the heart of Vándor's thesis: for the
  real *turista* the **trail segment is the unit of exploration**, not the POI —
  so the network of segments is what we put on screen. *Product:* pan/zoom the
  whole marked-trail web and pick any segment by hand.
  - *How:* only render the current viewport — cull segments to `map.getBounds()`
    and redraw on `moveend`/`zoomend` (~1054 segments total, so this stays light;
    it's really about not drawing the whole country when zoomed in). Keep the
    selected segment visually distinct (the existing white-cased coloured line)
    layered above the thin base network; dim/thin the rest. Click hit-testing via
    Leaflet polyline `click` events.
  - *Testable:* a pure `segmentsInBounds(edges, bounds)` filter (does an edge's
    bbox intersect the viewport?) — unit-tested; the Leaflet wiring is glue.
  - *Secondary, optional (may clutter — the user is wary):* also show in-viewport
    **POIs** as small kind icons with hover info. The 14.6k POIs make this a
    viewport-cull job too. Add behind a toggle or only if it doesn't drown the
    trails — the segments are the point, POIs are context.

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

- [ ] **Elevation enrichment.** Sample a DEM along each segment → store profile +
  gain/loss/max grade. Segments gain a difficulty signal. (Was T5; demoted to
  nice-to-have — the segment explorer matters more right now.)
- [ ] URL/hash state so a chosen segment is shareable/bookmarkable (kertiteto pattern).
- [ ] **Spaced-repetition memory** (Benedek István, *"járt utat járatlanért"*):
  personal persistence of which segment was walked *when*; weight the picker by
  recency so recently-done segments are deprioritised and the untrodden boosted.
  One segment = one flashcard; goal = cover every marked road. (Supersedes the
  old "avoid recent repeats".) Novelty should also feed the awesomeness score.
- [ ] Kid-excitement signals (castles, ruins, lookout towers, caves, buffet huts).
- [ ] Surface off-trail named POIs as *context* (254 named peaks/viewpoints sit
  >60 m from any marked trail, e.g. Tök-hegy, Csúcs-hegy): show the nearest named
  feature even when it isn't a segment endpoint, so a pick near a famous peak says so.
- [ ] Review the colourless **ST\* urban sétaút** routes (ST210/211/301/302):
  decide whether these city-walk networks belong in a *hegyvidéki* hike picker,
  or should be flagged/excluded. Optionally derive colour from single-letter
  mark glyphs (K/P/Z/S → kék/piros/zöld/sárga) when `osmc:symbol` is absent.
