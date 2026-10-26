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

## Turista-lencsék (Benedek István — current focus)

See [TURISTA-LENSES.md](TURISTA-LENSES.md) for the frame: the four *turista* types
are **four lenses over the same segment graph**, not four planning modes — a lens
changes what Vándor shows you about the *land*, never the túra. Two overlay lenses
(context-POI), one re-ranking lens (steepness), plus today's default. Each lens
ships standalone.

- [x] **T12a · Lens switch substrate.** Done 2026-10-25 (148 tests, +8). Pure
  [app/lens.ts](../app/lens.ts): the `Lens` vocabulary (`turista` default +
  kulturista/fajturista/kocaturista), `LENS_META` (icon/label/note/`implemented`
  flag — one home for the vocabulary), and hash (de)serialisation (`encodeLens`/
  `parseLens`; the default encodes to "" so plain links stay clean, composed with
  the túra hash via `&`). [index.html](../index.html) gained a `#lenses` row +
  `#lens-note`; [app/main.ts](../app/main.ts) builds the four icon toggles from
  `LENS_META`, `setLens`/`reflectLens` update the pressed button + `body[data-lens]`
  hook + the note (empty for turista; the not-yet-built lenses flag "hamarosan"),
  `syncHash` carries the lens, and it's restored from the opening hash + on
  `hashchange` (a shared link brings its lens). Lenses are **no-op** for now — the
  switch works, highlights, persists, and shares; T12b–d hang the overlays off
  `lens`. [app/lens.test.ts](../app/lens.test.ts): vocabulary completeness, guard,
  hash round-trip, and composition-safety with `parseTourHash`. Verified via
  headless screenshots (default = 🧭 active, no note; `#l=kulturista` restores the 🍷
  lens + "hamarosan" note).

- [x] **T12b · 🍷 kultúrista + vendéglátás ingest.** Done 2026-10-26 (170 tests,
  +22). ONE ingest serves TWO needs: the kultúrista lens *and* the
  [családi field note](FIELD-NOTES-CSALADI-TURA.md)'s "étterem sétatávban a végén".
  - [ingest/pois.ts](../ingest/pois.ts): `buildPoiQuery` now unions `amenity ∈
    {restaurant, cafe, fast_food, pub, bar, biergarten}` + `tourism=picnic_site`
    (nodes AND ways — restaurants/biergartens are area-mapped). New hospitality
    `kind`s (food/drink/picnic) via pure `classifyHospitality(tags)`, which `classify`
    delegates to; `fetch-pois.ts` unchanged. Raw ingest: 3638 food / 2169 drink /
    224 picnic in the 20 km bbox.
  - [graph/attach-hospitality.ts](../graph/attach-hospitality.ts): hospitality is a
    **context-POI, never a graph vertex** — `clipToNetwork` keeps only POIs within
    `HOSPITALITY_CLIP_M` (600 m) of any segment coordinate or baked access point
    (`withinOfNetwork` + `networkAnchors`), deduped by kind+position.
    [build-segments.ts](../graph/build-segments.ts) emits
    `data/hospitality.json` (3305 POIs, 241 KB) alongside segments.json.
  - [app/hospitality.ts](../app/hospitality.ts): pure runtime `hospitalityNear(pois,
    anchors, HOSPITALITY_NEAR_M=800)` narrows the committed set to sétatáv of the
    túra; `hospitalityIcon`/`hospitalityTooltip` label each pin (🍴/🍷/🧺).
  - [app/main.ts](../app/main.ts): under the 🍷 lens, `drawHospitality()` overlay
    (soft round emoji divIcon at each nearby POI, anchored on the túra's endpoints +
    access), panel line "🍴 N vendéglátóhely a közelben" (a quiet "nincs" when none).
    Gated on `lens === "kulturista"` → empty & cleared under every other lens; the
    lens still never touches the túra. [lens.ts](../app/lens.ts) `kulturista.implemented
    = true`.
  - *Tested:* `classifyHospitality`, `withinOfNetwork`/`clipToNetwork`, `hospitalityNear`
    + labels, and a `data/hospitality.json` integrity test (count band, all three kinds,
    every pin within the clip, no dupes). Verified via headless screenshots on the
    Normafa segment: 🍷 shows 22 pins + the panel line; 🧭 (default) shows the same
    túra with no pins.
  - **Refinement (2026-10-26, 176 tests):** split the overlay by lens and made the
    dob **lens-aware**. *Picnic belongs to the turista, not the kultúrista* — a real
    turista carries the backpack, a piknik only annoys the kultúrista who brought
    nothing: 🧭 draws 🧺 picnic (quiet "N piknikhely" line), 🍷 draws 🍴🍷 food/drink
    (no picnic). The **"dob" button renames per lens** (`rollLabel`, [lens.ts](../app/lens.ts)):
    "🎲 Vándor dob" for the default, "🎲 Kultúrista/Faj-turista/Kóca-turista dob" otherwise.
    Each lens **rolls with its own strategy** ([main.ts](../app/main.ts) `rollSeed`): 🧭
    novelty (the north star); 🍷 novelty within the food/drink-adjacent trail pool
    (`segmentsNearHospitality`, [hospitality.ts](../app/hospitality.ts)); 🐷 the
    **anti-Vándor** — re-treads an already-walked segment (`pickWalkedSegment`,
    [trip.ts](../app/trip.ts)), the exact inverse of "járatlanért"; 🩸 steepest, which
    falls back to novelty until the T12c DEM lands. Tested: `rollLabel`,
    `pickWalkedSegment`, `segmentsNearHospitality`.
  - **Compass-rose UI (2026-10-26):** the lens switch + dice moved out of the panel
    into a floating **iránytű** ([index.html](../index.html) `#compass`): the four lenses
    on a ring at the cardinal points — 🧭 turista N / 🐷 kóca S, 🍷 kultúrista W / 🩸
    faj-turista E (the opposites the philosophy asks for; a KWML quaternity, "a real
    turista is a bit of each") — around the **central dice**, now the app's biggest,
    boldest element. The ring is click-through (`pointer-events`), so the map stays
    reachable between the buttons; a pill caption under it names the active roll.
    `LENS_POS` in [main.ts](../app/main.ts) places each button; `rollLabel` lost its 🎲
    (the glyph lives on the dice button). See docs/TURISTA-LENSES.md "Az iránytű".
  - **Self-explaining compass (2026-10-26):** moved the iránytű to **top-right**
    (desktop `position: fixed`; mobile it folds into the panel top, since the near
    full-width panel leaves no room beside it). The **panel is now túra-only** — brand
    title and mode-note removed. The caption is a **toggle**: expanded, it reveals a card
    with the active turista's **Benedek István characterisation** (`LENS_META.blurb`, the
    four quotes + the "Az emberiség két részre oszlik…" framing in `TURISTA_INTRO`) and
    what the lens does. Open/closed state is **sticky in localStorage** (default open).
    Verified desktop + mobile (device-emulated via CDP — note `shot.sh`'s `--window-size`
    inflates the layout viewport ~1.16×, so its right-edge "clipping" is an artifact, not
    a real overflow) and the collapse/persist round-trip.
  - **Mobile collapse-to-compass workflow (2026-10-26):** on phones the tall panel
    swallowed the map, so the túra body is wrapped in `#panel-body` and the panel
    **folds down to just the compass** by default — a slim `#panel-handle` (▾) expands
    it. Rolling the dice or committing a tour action (close-loop / fill-gap) auto-
    collapses via `collapsePanel()`, so you throw the dice / switch lenses with the map
    in view and the result lands on the map, not behind the panel. Desktop is untouched
    (handle `display:none`, body always shown, `.panel-open` a no-op). Benedek box
    defaults closed on mobile / open on desktop. CDP-verified the full flow
    (collapsed → handle expand → roll re-collapses) at an emulated 390×844.
  - **Unified top-right hub + collapsed-mode action pills (2026-10-26):** the separate
    top-left panel is gone — the whole `#panel` is now one **transparent, auto-width
    control column pinned top-right** (desktop + mobile): compass → caption → Benedek →
    `#panel-actions` → handle → `.panel-body` (the túra, now carrying the paper card).
    Auto width = compass-narrow when collapsed, túra-card-wide (capped 21rem) when open.
    In collapsed mode the loop/fill/empty buttons appear as **icon-only pills** (🔄 / 🧩 /
    🗑️, whichever apply) sharing the body buttons' classes so one delegated handler on
    `#panel` drives both — so you can act without expanding. `isMobile` switched to
    `innerWidth ≤ 640` (reliable under CDP emulation, unlike `matchMedia`). CDP-verified
    desktop + mobile collapsed/expanded and that the clear pill fires end-to-end.

- [ ] **T12c · 🩸 faj-turista + elevation ingest.** SRTM 1-arcsec `.hgt` tiles for
  the bbox (2–4 tiles; raw int16, **zero deps**, offline, deterministic — fits the
  "commit the data" ethos; NOT an elevation API — rate-limited/flaky).
  `ingest/elevation.ts` (pure: tile index → `sampleElevation`, `profileAlong`,
  `gradeMetrics`) + `fetch-dem.ts` (`npm run dem`). `graph/build-segments.ts` gains
  an `attachElevation` step; `Edge.grade = {gainM, lossM, maxGradePct, meanGradePct}`
  (steepness over a ~100 m sliding window so a single step can't win).
  [app/trip.ts](../app/trip.ts): `pickSteepSegment` (roll from the steep quantile) +
  `topSteepest(edges, n)`. [app/main.ts](../app/main.ts): under 🩸, crown divIcon at
  the top-5 segment midpoints ("👑 #3 · 24%"), roll biased steep, grade row in the
  panel. **High-leverage:** the DEM also unblocks the deferred túra elevation profile
  (T7 later), a difficulty signal, and an awesomeness input.
  - *Roll already stubbed (T12b):* the 🩸 button renames to "Faj-turista dob" and
    `rollSeed`'s `fajturista` branch is a novelty fallback — fill it with
    `pickSteepSegment` once `Edge.grade` exists.

- [ ] **T12d · 🐷 kóca-turista (gag).** `shop ∈ {outdoor, sports}` overlay reusing
  the T12b overlay infra — different `kind`, pig icon. Cheap joke; do last / optional.
  - *Roll already shipped (T12b):* the 🐷 button renames to "Kóca-turista dob" and
    rolls `pickWalkedSegment` — the anti-Vándor re-treads walked paths (novelty
    fallback until the profile has one). Only the shop overlay remains for this task.

## Automatic planner (later)

- [ ] **T8 · Planner (transit-aware).** Allow start ≠ end when reachable by
  bus/cogwheel/chairlift; prefer public transport where sensible. **Substrate is
  already in place:** `planWalk` ([app/walk.ts](../app/walk.ts)) takes `{start, close}`
  and the `close:false` branch is an *open* walk (start ≠ end) — transit = `close:false`
  + a bus-stop access. First slice (a 🚗↔🚌 switch, per the családi field note item 6 —
  access-mode is a property of the *group*): `bus_stop` POIs are already ingested, so
  bake each vertex's nearest *usable* bus stop in [graph/attach-access.ts](../graph/attach-access.ts)
  (`Vertex.transitAccess`, mirroring parking); [app/main.ts](../app/main.ts) gets an
  `accessMode` state — car draws parking + closed loop (`close:true`), transit draws
  bus stops at *both* túra ends + open walk, a BKK/Mapy transit link instead of the
  Google Maps drive link; hash `&a=car|transit`. This is literally the
  [debütál field note](FIELD-NOTES-VANDOR-DEBUT.md) pattern: known stop, new direction,
  bus back from a *nearer* stop.
- [ ] **T9 · Planner (optimiser).** Score candidate itineraries on car duration,
  hike length (~5–10 km), elevation, and awesomeness; return the best. The real
  input (per the [családi field note](FIELD-NOTES-CSALADI-TURA.md)) is a
  **kényszer-profil** object, not a goal POI: max walk time/length, access mode,
  restaurant-at-the-end flag, an avoid/"ismerős" filter (the spaced-repetition
  inverse — invert `profile.ts` under a "család-mód"), parking-capacity in the
  access ranking, and a meeting time+place field alongside the shared `#t=…&p=…` hash.

## Awesomeness — underfoot surface (current focus)

See [AWESOMENESS-SURFACE.md](AWESOMENESS-SURFACE.md) for the full research: surface
is two axes — **underfoot** (what you walk *on*, from the `highway` tag, which we
already have) and **surroundings** (forest/field/urban, needs a landcover spatial
join). We start with underfoot because the data is already in the graph.

- [x] **T10a · Underfoot surface class + at-a-glance emphasis.** Derive a
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
  - **Done:** pure `surfaceClass(highway)` in [app/surface.ts](../app/surface.ts)
    ({trail, paved, road}, unknown→paved). `drawNetwork()` keys a `SURFACE_STYLE`
    map on it — trail full (w3.5/o0.85, solid), paved thin+faded+dashed
    (w2/o0.5/"4 4"), road faintest (w1.5/o0.3/"2 5"); hover overrides to bold
    solid; waymark colour preserved. `roll()` seeds only from `trail` edges.
    Verified: auto-roll landed on a tanösvény; the marked route along Szabadság út
    (secondary) draws faint+dashed while trail segments stay solid. 6 new tests
    (pure cases + the 67/27/6 %km split + trail-seed guarantee); 116 green.
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
- [~] **Spaced-repetition memory** (Benedek István, *"járt utat járatlanért"*):
  personal persistence of which segment was walked *when*; weight the picker by
  recency so recently-done segments are deprioritised and the untrodden boosted.
  One segment = one flashcard; goal = cover every marked road. (Supersedes the
  old "avoid recent repeats".) Novelty should also feed the awesomeness score.
  - **First slice done (2026-10-25).** Local user profile: pure model
    [app/profile.ts](../app/profile.ts) (`markWalked`/`isWalked`/`lastWalked`/
    `walkCount`/`distinctWalkedCount`, immutable); persistence behind a swappable
    `ProfileStore` interface, localStorage impl [app/profile-store.ts](../app/profile-store.ts)
    (defensive load, degrades to empty). `pickNovelSegment` in [app/trip.ts](../app/trip.ts)
    = two-tier novelty roll (uniform among never-walked; else age-weighted among
    all walked); "Vándor dob" now uses it. A **✓ Bejártam** button logs the túra's
    segments; walked segments draw **faded** in the base network; the empty panel
    shows a quiet "🥾 Eddig N szakaszt jártál be" tally (deliberately understated —
    no conquest scoreboard, per the gamification-hazard note). 17 new tests (134 green).
  - **Deferred — where the profile lives (persistence/privacy):** localStorage
    for now. Options noted in the [app/profile-store.ts](../app/profile-store.ts)
    header: encrypted export/import file the user owns (iCloud/Drive = sync); or
    zero-knowledge sync via a Cloudflare Worker + KV storing a client-encrypted
    blob (WebCrypto AES-GCM, key from a passphrase). Vándor is a *public static
    site* so it can hold no write secret — client-side encryption makes the
    backend a dumb blob store.
  - **Later:** feed novelty into the awesomeness score (not just the roll);
    optional (opt-in) coverage viz; per-segment "last walked" shown in the panel.
  - **✅ BLOCKER RESOLVED (2026-10-25) — stable segment identity across ingests.**
    Every edge now carries a **stable, content-derived `key`** (persisted in
    `segments.json`), independent of build order: `edgeStableKey` in
    [graph/graph.ts](../graph/graph.ts) hashes (cyrb53→base36) the sorted
    constituent OSM way ids + the two endpoint tokens — the OSM node id for real
    vertices, rounded coords (`endpointToken`) for synthetic POI-split vertices
    (negative osmId). Both ways and endpoints are sorted so from/to orientation and
    way-list order can't move the key. The profile keys on `key`, never the index;
    the app reads `edge.key` directly (no reverse map needed since the edge object
    is in hand).
    - **Parallel-arc collisions:** a loop out to a POI-split dead-end peak and back
      shares ways + endpoints (one real collision found: edge 341/342 →
      *Törökugrató*). `dedupeEdgeKeys` (run once in `build-segments.ts`) appends a
      direction-independent geometry fingerprint to *only* the colliding edges, so
      the common case stays maximally stable. Verified: 1050/1050 keys unique and
      0 drift across a rebuild.
    - **Graceful drift** as planned: an OSM edit that splits/merges a constituent
      way (or moves a POI-split point) changes that edge's key → reads "unwalked"
      again (rare, self-healing).
    - **No migration (by decision):** there are zero real profiles in the wild, so
      the profile store just bumps to `vandor.profile.v2` (string-keyed) and orphans
      any stale pre-stable-key dev blob — no migration code to carry.
    - **Shared links now key-based (one-time break allowed).** The URL hash
      (`#t=…&p=lon,lat`) encodes segment *stable keys* instead of build-order indices
      ([app/tour.ts](../app/tour.ts) `encodeTourHash`/`parseTourHash`; `main.ts`
      resolves keys→current edge via an `edgeByKey` map). The links we message each
      other are our proto-persistence — now they survive re-ingests too. Old
      index-based links are intentionally broken this once. Example:
      `#t=1oqq271b9b,16q7r5xp2y9,wdgdoact1a~ak9hom737r&p=18.991,47.56`.
    - Tests: `graph.test.ts` (order/index independence, synthetic-coord fallback,
      dedupe), `segments-data.test.ts` (every committed edge has a unique non-empty
      key), `tour.test.ts` (key-based hash round-trip). 140 tests green.
- [ ] Kid-excitement signals (castles, ruins, lookout towers, caves, buffet huts).
- [ ] Surface off-trail named POIs as *context* (254 named peaks/viewpoints sit
  >60 m from any marked trail, e.g. Tök-hegy, Csúcs-hegy): show the nearest named
  feature even when it isn't a segment endpoint, so a pick near a famous peak says so.
- [ ] Review the colourless **ST\* urban sétaút** routes (ST210/211/301/302):
  decide whether these city-walk networks belong in a *hegyvidéki* hike picker,
  or should be flagged/excluded. Optionally derive colour from single-letter
  mark glyphs (K/P/Z/S → kék/piros/zöld/sárga) when `osmc:symbol` is absent.
