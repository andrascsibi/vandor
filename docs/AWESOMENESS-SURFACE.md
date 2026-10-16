# Research — segment surface / environment as an awesomeness signal

*Research note for the awesomeness black box (T10/T11). Question: can we
categorise each segment by how nice it is to walk — forest (max) → open field
(6) → town/village (3) → beside a motor road (0)? Do we have the data, or can we
derive it?*

## Key reframe: it's two independent axes, not one scale

Andras's 4-tier scale conflates two things that need different data:

1. **Underfoot — what you walk *on*** (the way itself): forest trail vs paved
   street vs tarmac road. → the OSM `highway` (+ `surface`) tag of the segment.
2. **Surroundings — what you walk *through*** (the corridor around you): closed
   forest vs open field vs built-up vs "next to a loud road". → OSM landcover
   polygons + proximity to motor roads.

Both matter and they're orthogonal: a forest *path* and a village *sidewalk* are
both easy underfoot but score very differently on surroundings; a forest path and
a forest track differ underfoot but share the surroundings. The final per-segment
score is a small function of both (then combined with the novelty term later).

## Axis 1 — Underfoot: **we already have this, for free**

Every segment already carries the way's `highway` tag (`graph/…` → `edges[].highway`).
Distribution over the current 859 km / 1050 segments:

| tier | highway values | km | %km |
|---|---|---|---|
| **natural trail** | track, path, footway, steps, cycleway | ~575 | 67% |
| **quiet paved / settlement** | residential, living_street, pedestrian, service, unclassified | ~235 | 27% |
| **motor road (traffic)** | secondary, tertiary | ~49 | 6% |

So a *useful first-cut awesomeness-by-surface can ship today* with zero new data:
derive a `surfaceClass ∈ {trail, paved, road}` from `highway`. That already
isolates the ~6% of km on classified motor roads (clear 0–2 candidates) and the
27% of settlement walking (the ~3/10 band) from the 67% of genuine trail.

**Limit:** `highway` cannot split *forest*-path from *field*-path — both are
`highway=path`/`track`. That's the whole reason we need axis 2.

### `surface` tag — cheap refinement, partial coverage
OSM also has `surface=` (ground/dirt/gravel/compacted vs asphalt/paved) and
`tracktype=grade1..5`. We *don't persist these yet* — a one-line change in
`ingest/overpass.ts` (`properties.surface = tags.surface`) + carry through
`graph/build-segments.ts` adds them. Coverage on Hungarian marked trails is only
partial, so treat it as a tie-breaker on top of `highway`, not a primary signal.

## Axis 2 — Surroundings: **derivable via spatial join, needs multipolygons**

The forest/field/urban distinction is **not** on the trail way; it comes from the
land *around* it. OSM maps this well in the Budai-hegység:
- `landuse=forest` / `natural=wood` — forest (max awesome)
- `landuse=farmland` / `meadow` / `natural=grassland` / `scrub` — open (≈6)
- `landuse=residential` / `industrial` + `building` density — built-up (≈3)

**Method:** fetch these polygons once (offline, like the other ingests), then
point-in-polygon test several sample points along each segment (not just the
midpoint — a segment can cross a forest edge) and take the majority / fraction.
Bake a `landcover` field per segment, mirroring the existing
`graph/attach-pois.ts` / `graph/attach-access.ts` offline-bake pattern.

**Gotcha found while prototyping (important):** in the Buda hills, forest is
mapped overwhelmingly as **multipolygon relations**, not closed ways — e.g. one
Hárs-hegy bbox had **23 forest/wood relations** but a naive *ways-only* fetch +
PIP classified only 1 of 200 segment midpoints as forest (badly wrong). Two ways
to handle the relations:
- **Overpass `is_in(lat,lon)`** returns *areas*, which pre-resolve multipolygons
  (verified: it correctly reports the Budai-hegység relation). Clean per point,
  but one request per point → rate-limited for thousands of sample points.
- **Bulk-fetch forest/open/urban incl. relations once, then local PIP.** Convert
  the relation geometry to proper multipolygons (outer − inner rings) — easiest
  with `osmtogeojson`, or assemble rings by hand — then test all points offline.
  This is the production path: one query, no per-point rate limits.

Data availability confirmed live against Overpass: forest/wood polygons are dense
and current; the only engineering cost is correct multipolygon assembly.

## Axis 2b — "beside a motor road": **proximity cross-check** (Andras's idea)

The nastiest case (0/10) is a trail that is itself `highway=path` but runs *right
next to* a busy road — `highway` won't catch it. This is exactly the
"cross-check against street data" intuition: fetch `highway=motorway|trunk|primary|
secondary|tertiary` **lines**, and for each segment compute the min distance to
one; flag `besideTraffic` when the segment hugs a road (e.g. median point-to-line
< ~25–30 m over much of its length). Same offline-bake pattern, cheap.

## Proposed per-segment environment score (sketch, for T10)

```
base   = { forest: 10, open: 6, builtUp: 3 }[landcover]        // axis 2
foot   = { trail: 0, paved: -1, road: -4 }[surfaceClass]       // axis 1 modifier
penal  = besideTraffic ? -6 : 0                                // axis 2b
score  = clamp(base + foot + penal, 0, 10)
```
Then the awesomeness black box blends this `environmentScore` with the novelty
term (from personal visit history — see [[vandor-philosophy]]) and any
scenery/kid-excitement signals.

## Recommendation — incremental backlog tasks

1. **T10a · `surfaceClass` from `highway` (ship now, no new data).** Derive
   {trail, paved, road}; surface it in the panel + as a cheap awesomeness input.
   Immediately flags the 6% motor-road and 27% settlement km.
2. **T10b · `landcover` spatial join (`graph/attach-landcover.ts`).** Bulk-fetch
   forest/open/urban polygons **including relations**, assemble multipolygons
   (`osmtogeojson` or manual), multi-sample PIP per segment → `edges[].landcover`.
   The biggest surroundings signal in a forest region.
3. **T10c · `besideTraffic` proximity flag.** Cross-check segments against motor-
   road lines; the 0/10 catcher.
4. **T10d · persist `surface`/`tracktype`** as a refinement (one-line ingest add).

All four are pure, offline, testable, and follow the attach-\*.ts bake pattern —
each ships a standalone, visible improvement before the LLM awesomeness layer.
