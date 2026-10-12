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

- [x] **T5 · Segment network explorer (viewport).** All in-viewport segments
  are drawn as a bold base layer coloured by waymark (canvas pane below the
  highlight); **click/tap any segment → it's selected and the panel updates**
  (same panel as the random pick), a hands-on alternative to "Vándor dob". The
  heart of Vándor's thesis: the **segment is the unit of exploration, not the
  POI**. Viewport-culled via the pure `segmentsInBounds(edges, bounds)` (bbox
  intersection, unit-tested), redrawn on `moveend`; selected segment excluded
  from the base and layered above with its white-cased highlight. Canvas
  `tolerance` makes thin lines easy to click; hover thickens + sets a pointer
  cursor; a panel hint invites clicking.
  - *Still optional (deferred — user wary of clutter):* in-viewport **POI** icons
    with hover info, viewport-culled and behind a toggle. Segments are the point.

## Trip planner ("reveal awesomest itinerary")

- [x] **T6 · Nearest car access (by-hand, not routed).** For each end of the
  selected segment, bake the nearest *usable* parking (crow-flies) into the graph
  (`graph/attach-access.ts`, offline) and show it: a 🅿️ marker + a thin dashed
  straight line from the endpoint, with the distance in the panel ("🅿️ 0,4 km ·
  0,7 km", deduped when both ends share a lot); fit frames the segment + its
  parking. Deliberately dumb — it points at the car and leaves the approach-trail
  judgment to the turista. `access` filter drops private/no/customers/permit
  (2053 of 6735 parking excluded); all 804 endpoints got a point.

## Manual trip building (current focus — aid the hand, don't route)

- [ ] **T7 · Manual trip builder ("túra").** A *túra* is an (implicitly ordered)
  collection of segments you assemble by clicking. Build a nice loop by hand,
  keep every access point visible, and let the turista judge the approach —
  rather than trusting a router over unmarked/blocked paths. Sub-tasks:
  - [ ] **T7a · Túra model (pure, tested).** Ordered segment set: toggle
    add/remove, total distance, and order into a walking sequence (chain segments
    by shared endpoints) for the Mapy link + the túra's open ends.
  - [ ] **T7b · Click to add/remove + render.** Clicking a segment toggles its
    membership; all túra segments drawn highlighted, the rest stay the clickable
    base network. "Vándor dob" starts a fresh túra from a random seed segment.
  - [ ] **T7c · Túra summary panel.** List of segments (mark / named endpoints /
    length), count, total distance (elevation profile later), a clear button.
  - [ ] **T7d · Access-point choice.** Show the candidate parking for the túra's
    endpoints; click one to choose it as the start (distinct marker + dashed line
    to the nearest end); hide the others until it's unselected.
  - [ ] **T7e · Mapy link for the whole túra.** Route through the ordered segments
    incl. the chosen access point (park → loop → back). Confirm Mapy's waypoint
    format.
  - [ ] *Later:* elevation profile of the túra; URL/hash so a túra is shareable.

## Automatic planner (later)

- [ ] **T8 · Planner (transit-aware).** Allow start ≠ end when reachable by
  bus/cogwheel/chairlift; prefer public transport where sensible.
- [ ] **T9 · Planner (optimiser).** Score candidate itineraries on car duration,
  hike length (~5–10 km), elevation, and awesomeness; return the best.

## Awesomeness (the black box)

- [ ] **T10 · Metadata layer.** Attach accessibility + user rating fields to segments.
- [ ] **T11 · AI awesomeness score.** LLM over written reviews/descriptions →
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
