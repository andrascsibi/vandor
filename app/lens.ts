// T12a — the turista-lens switch (Benedek István's four wanderers as four lenses
// over the same segment graph; see docs/TURISTA-LENSES.md). A lens never changes
// the túra — it changes what Vándor shows you about the *land*. This module is the
// pure substrate: the lens vocabulary, its metadata, and URL-hash (de)serialisation
// so a chosen lens rides along in a shared link. No DOM, no Leaflet — unit-testable.

export const LENSES = ["turista", "kulturista", "fajturista", "kocaturista"] as const;
export type Lens = (typeof LENSES)[number];

/** turista is the default — the current app (az út a cél, novelty-weighted roll). */
export const DEFAULT_LENS: Lens = "turista";

export interface LensMeta {
  /** The icon shown on the switch button. */
  icon: string;
  /** Short name for the button's accessible label / tooltip. */
  label: string;
  /** One-line purpose — what the app does under this lens (compass info box). */
  note: string;
  /**
   * Benedek István's characterisation of this turista (the compass info box, in
   * modern phrasing "Benedek István nyomán"). The soul of the lens — why it exists.
   */
  blurb: string;
  /** False while a lens is only substrate (T12a) — the note then flags it "hamarosan". */
  implemented: boolean;
}

export const LENS_META: Record<Lens, LensMeta> = {
  turista: {
    icon: "🧭",
    label: "turista",
    note: "Járt utat a járatlanért MINDIG hagyd el.",
    blurb:
      "A csúcson kétszeresen jól érzi magát: élvezi a természet szépségét és a megtett utat, a nehézségek legyőzését.",
    implemented: true,
  },
  kulturista: {
    icon: "🍷",
    label: "kulturista",
    note: "Vendéglátás a túra körül, túra a vendéglátás körül.",
    blurb:
      "Fölsétál addig, ameddig kényelmesen feljuthat, pihen és gyönyörködik, nem veti meg a kilátóhelyen létesített vendéglőket.",
    implemented: true,
  },
  fajturista: {
    icon: "🩸",
    label: "fajturista",
    note: "A legmeredekebb szakaszok rangsora.",
    blurb:
      "Olyan, mint a tisztafajú tenyészállat. Ő csak a teljesítményt élvezi.",
    implemented: false,
  },
  kocaturista: {
    icon: "🐷",
    label: "kocaturista",
    note: "Népszerű és már bejárt szakaszok.",
    blurb:
      "Előkelően kiöltözve és szakszerűen fölszerelve ide-oda lötyög s mindig többet mutat, mint amennyire valójában képes.",
    implemented: false,
  },
};

/** The framing line above the four turistas in the compass info box. */
export const TURISTA_INTRO =
  "Benedek István nyomán négyféle turistát különböztetünk meg. Te melyikkel azonosulsz ma?";

/** Type guard: is this string one of our lenses? */
export function isLens(s: string | null | undefined): s is Lens {
  return !!s && (LENSES as readonly string[]).includes(s);
}

/**
 * The "dob" caption under a lens (T12b). Each lens rolls with its own strategy —
 * so the caption names the active one: the brand "Vándor dob" for the default
 * turista, "<Lens> dob" otherwise (e.g. "Kulturista dob"). The 🎲 glyph lives on
 * the central dice button of the compass, not in this text.
 */
export function rollLabel(lens: Lens): string {
  if (lens === DEFAULT_LENS) return "Vándor dob";
  const label = LENS_META[lens].label;
  return `${label[0].toUpperCase()}${label.slice(1)} dob`;
}

/**
 * Serialise a lens into a URL-hash fragment (no leading `&`). The default lens
 * encodes to "" so ordinary links stay clean — only an explicitly chosen lens
 * rides along. Composed with the túra hash (`t=…&p=…`) by the app.
 */
export function encodeLens(lens: Lens): string {
  return lens === DEFAULT_LENS ? "" : `l=${lens}`;
}

/** Read the lens out of a URL hash; unknown / absent → the default lens. */
export function parseLens(hash: string): Lens {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const l = params.get("l");
  return isLens(l) ? l : DEFAULT_LENS;
}
