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

- [x] **T7 · Manual trip builder ("túra").** A *túra* is an (implicitly ordered)
  collection of segments you assemble by clicking. Build a loop by hand, keep the
  access options visible, let the turista judge the approach. All sub-tasks done:
  - [x] **T7a · Túra model (pure, tested).** `app/tour.ts`: toggle add/remove,
    total distance, `orderedWaypoints` (greedy chain by shared endpoints),
    `tourAccessPoints` (deduped candidate parking, closest approach per lot).
  - [x] **T7b · Click to add/remove + render.** Click a segment to toggle it; túra
    segments highlighted (click to remove), the rest stay the clickable base
    network. "Vándor dob" seeds a fresh túra from a random segment.
  - [x] **T7c · Túra summary panel.** Per-segment rows (swatch / marks / named
    endpoints / length / ✕), count, total distance, clear button.
  - [x] **T7d · Access-point choice.** Candidate parking (blue P) for the túra's
    ends; click one → it's the green chosen start with a dashed approach line, the
    others hide; click it again to release. Panel shows "🅿️ Indulás: … · dist".
  - [x] **T7e · Mapy link for the whole túra.** `mapyTripUrl` routes through the
    ordered junctions; with a chosen start it goes park → túra → back (Mapy
    `waypoints=lon,lat;…`, max 15).
  - [x] **T7f · Shareable link + drive-there.** The túra (segment ids + chosen
    parking) is persisted in the URL hash (`#t=…&p=lon,lat`, `replaceState`, loaded
    on open / `hashchange`) → send the link to the family. Panel shows the chosen
    parking's crow-flies distance from Széll Kálmán tér, and a Google Maps
    drive-to-the-parking link sits under the Mapy link.
  - [ ] *Later:* elevation profile of the túra.

- [x] **T7g · Mapy waypoint order.** `orderedWaypoints` now takes an optional
  `preferredStart` and begins the greedy chain at the open end nearest it; with a
  chosen parking the route flows park → near end → through the túra → far end →
  back, instead of park → middle → back-and-forth → car. Unit-tested + verified
  end-to-end (first Mapy waypoint is the túra end closest to the car).

## Proto-planner (routing over the segment graph) — current focus

- [x] **T7h · Router substrate.** `app/router.ts`: a pure Dijkstra
  (`buildRouteGraph` + `shortestPath`, ~800-vertex linear-scan frontier) and the
  túra topology helpers it feeds — `tourComponents` (gap detection),
  `tourOpenEnds`, `deadEndVertices`, `fillTourGaps`, `closeTourLoop`. Fully
  unit-tested; runs over the real 1054-segment graph in a few ms.

- [x] **T7i · Discontinuous túra: warn + fill the gap.** When the selected
  segments fall into several disconnected pieces (common: clicking non-adjacent
  segments of the same trail), the panel shows an amber "⚠️ Nem összefüggő túra"
  warning and a **Töltsd ki a hézagot** button that routes the missing trail
  between the pieces (`fillTourGaps`) and reframes the map.

- [x] **T7j · Close the loop.** A continuous túra with ≥2 live open ends gets a
  **🔄 Zárd be a kört** button that routes the ends back together over the rest
  of the network (`closeTourLoop`, each selected segment walked at most once) —
  an instant loop planner. *Járt utat járatlanért.*
  - **Note on loop length:** an early test gave an 18 km loop where a 12.9 km one
    existed. That was **not** a routing-quality / out-and-back issue — it was the
    split-dead-end bug (false dead-ends across a road crossing, fixed in the graph
    bridge pass) forcing a long detour. Resolved. Whether a true optimiser could
    still trim a loop by allowing a *tiny* there-and-back instead of a long way
    round is an open, separate question (T9) — unproven, and unrelated to that
    example.

- [x] **T7k · Dead ends count twice.** Genuine dead ends (summits / trail
  termini — interior degree-1 vertices; map-boundary stubs excluded) are ignored
  by the router (Dijkstra never routes through a degree-1 vertex) but, when a user
  selects such a spur, it's walked oda-vissza: the túra headline shows the real
  walking distance, spur rows get an ↩ marker, and the extra is noted.
  - [ ] *Possible next:* distinguish a "there-and-back" túra total from a "loop"
    total once a start is chosen; let close-the-loop prefer the nearest live ends
    to the parking; multi-leg loops when the túra forks.

- [x] **T7l · "Az út a cél" — closed-walk planner (`app/walk.ts`).** Rebuilt the
  túra→walk derivation on one model: a car túra is a **closed walk returning to its
  start vertex**, so segment duplication is a property of the *túra subgraph* (its
  odd-degree vertices → Chinese-Postman T-join, via `tJoinEdges`), not of the whole
  network. `planWalk` replaces `orderedWaypoints`/`orderedSegments`/
  `tourWalkingLengthM`/`isRetraceSpur` and the global `retraceVertices`: **linear**
  (no duplication) while no parking is chosen — so "Vándor dob" on one segment
  doesn't auto-double — and a **closed Euler circuit** (Hierholzer) from the túra
  vertex nearest the car once a parking fixes start = end. Fixes three bugs: (1) a
  loop+spur no longer starts at the dead-end tip; (2) a spur that's a through-trail
  in the network (e.g. 463 "Schüller út") but degree-1 *within the túra* is now
  doubled + flagged; (3) doubled segments show as **two rows** (return flagged ↩),
  which also handles figure-8 / dumbbell retraces that repeat a segment
  non-adjacently. Forward-compatible with transit access (start ≠ end). Also fixed
  **Mapy truncation**: `mapyTripUrl` now *evenly subsamples* a long trip to ≤15
  waypoints (`subsampleEvenly`) instead of keeping only the first 15. 10 new
  `walk.test.ts` specs; 110 tests green.

## Automatic planner (later)

- [ ] **T8 · Planner (transit-aware).** Allow start ≠ end when reachable by
  bus/cogwheel/chairlift; prefer public transport where sensible.
- [ ] **T9 · Planner (optimiser).** Score candidate itineraries on car duration,
  hike length (~5–10 km), elevation, and awesomeness; return the best.

## Awesomeness — underfoot surface (current focus)

See [AWESOMENESS-SURFACE.md](AWESOMENESS-SURFACE.md) for the full research: surface
is two axes — **underfoot** (what you walk *on*, from the `highway` tag, which we
already have) and **surroundings** (forest/field/urban, needs a landcover spatial
join). We start with underfoot because the data is already in the graph.

- [ ] **T10a · Underfoot surface class + at-a-glance emphasis (NEXT UP).** Derive a
  pure `surfaceClass ∈ {trail, paved, road}` from each segment's `highway` tag
  (trail = track/path/footway/steps/cycleway/bridleway; paved = residential/
  living_street/pedestrian/service/unclassified; road = secondary/tertiary/primary/
  trunk). *Product:* **the explorer reads at a glance for route planning** —
  natural-trail segments drawn emphasised (full weight/opacity), paved segments
  de-emphasised (thinner / faded / dashed), motor-road segments de-emphasised the
  **most** (faintest). Plus: **"Vándor dob" only seeds from natural trails** (filter
  the random pick to `surfaceClass === "trail"`). *Testable:* pure
  `surfaceClass(highway)` unit tests + the ~67/27/6 %km split (natural/paved/road)
  from the research; random pick never returns a paved/road seed.
  - Implementation notes: `surfaceClass` is a pure helper (new in `app/trip.ts` or
    a small `app/surface.ts`), no re-ingest needed — `edges[].highway` is present.
    Emphasis applies in `drawNetwork()` ([app/main.ts](../app/main.ts)) via the
    base-layer style (weight/opacity/dashArray) keyed on `surfaceClass`; keep the
    waymark colour, vary only the visual weight so colour still reads. The túra
    highlight + selected styling stay as-is. Filter the roll in `roll()` /
    `pickRandomSegment`.
  - Later (T10b–d, see research doc): `attach-landcover.ts` forest/field/urban
    spatial join (handle multipolygon **relations**), `besideTraffic` proximity
    flag, persist `surface`/`tracktype`.

- [ ] **T10 · Metadata layer.** Attach accessibility + user rating fields to segments.
- [ ] **T11 · AI awesomeness score.** LLM over written reviews/descriptions →
  per-segment awesomeness score the optimiser reads. The "LEAN proof of awesomestness"
  lives here (show the reasoning/evidence behind the score).

## Later / nice-to-have

- [ ] **Elevation enrichment.** Sample a DEM along each segment → store profile +
  gain/loss/max grade. Segments gain a difficulty signal. (Was T5; demoted to
  nice-to-have — the segment explorer matters more right now.)
- [x] URL/hash state so a túra is shareable/bookmarkable (done in T7f).
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
