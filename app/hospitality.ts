// Runtime side of the 🍷 kultúrista lens (T12b). The committed data/hospitality.json
// is the whole hegyvidéki hospitality set (clipped to the trail net at build time);
// at runtime we narrow it to what's in *sétatáv* of the chosen túra — its endpoints
// and access points — and label each pin. Pure (no Leaflet/DOM) so it's unit-testable;
// main.ts does the drawing. A lens never touches the túra — this only reads the land.

import { haversine, type Edge } from "../graph/graph.ts";
import type { HospitalityPoi } from "../graph/attach-hospitality.ts";
import type { HospitalityKind } from "../ingest/pois.ts";

/** Walking reach around the túra's anchors a turista will detour for (metres). */
export const HOSPITALITY_NEAR_M = 800;

const META: Record<HospitalityKind, { icon: string; word: string }> = {
  food: { icon: "🍴", word: "étterem / büfé" },
  drink: { icon: "🍷", word: "kocsma / kávézó" },
  picnic: { icon: "🧺", word: "piknikhely" },
};

/** The pin glyph for a hospitality kind. */
export function hospitalityIcon(kind: HospitalityKind): string {
  return META[kind].icon;
}

/** Tooltip text for a pin: its name if known, else the kind word, with the glyph. */
export function hospitalityTooltip(p: HospitalityPoi): string {
  const { icon, word } = META[p.kind];
  return `${icon} ${p.name ?? word}`;
}

/**
 * The hospitality POIs within `radiusM` of any anchor (the túra's endpoints +
 * access points). Returns a fresh array; preserves input order. With no anchors
 * (an empty túra) nothing is near, so the overlay stays empty.
 */
export function hospitalityNear(
  pois: HospitalityPoi[],
  anchors: [number, number][],
  radiusM = HOSPITALITY_NEAR_M,
): HospitalityPoi[] {
  if (anchors.length === 0) return [];
  return pois.filter((p) =>
    anchors.some((a) => haversine([p.lon, p.lat], a) <= radiusM),
  );
}

/**
 * The segments with hospitality on or close to them — the pool the kultúrista roll
 * seeds from (T12b): a dob that lands near food/drink, not deep in the empty forest.
 * A segment qualifies if any POI is within `radiusM` of a sampled point on it
 * (start / middle / end — enough for a median ~470 m segment without scanning the
 * whole polyline). Pass already kind-filtered `pois` (e.g. food + drink). Empty in,
 * empty out, so an absent hospitality layer just means the caller falls back.
 */
export function segmentsNearHospitality(
  edges: Edge[],
  pois: HospitalityPoi[],
  radiusM = HOSPITALITY_NEAR_M,
): Edge[] {
  if (pois.length === 0) return [];
  return edges.filter((e) => {
    const c = e.coordinates;
    const samples = [c[0], c[Math.floor(c.length / 2)], c[c.length - 1]];
    return samples.some((pt) => pois.some((p) => haversine([p.lon, p.lat], pt) <= radiusM));
  });
}
