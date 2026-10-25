// The Vándor's personal walk history — the north star made concrete (see
// docs/FIELD-NOTES-VANDOR-DEBUT.md and the philosophy memory): *"járt utat
// járatlanért mindig hagyj el"*. One marked segment = one flashcard; the profile
// records which segments you've walked and when, so the picker can favour the
// untrodden (spaced repetition — oldest/never-walked first).
//
// Pure data + pure helpers only — no DOM, no localStorage, no clock. Persistence
// lives in `profile-store.ts` (localStorage today; see that file's header for the
// encrypted-file / zero-knowledge-sync options we deferred). Every mutator returns
// a NEW profile so it stays trivially testable and swappable.
//
// Segments are keyed by their STABLE content key (`Edge.key` from graph.ts), never
// the build-order `id` index — so a re-ingest that reshuffles indices can't
// silently mislabel which trail you walked. The app translates key↔current-edge.

/** A personal walk history: segment key → timestamps (epoch ms) it was walked. */
export interface Profile {
  /** One entry per distinct walked segment; the array lists each walk's time. */
  walks: Record<string, number[]>;
}

export function emptyProfile(): Profile {
  return { walks: {} };
}

/**
 * Record that `ids` were all walked at `at` (defaults to now). Returns a new
 * profile; appends to any existing history for a segment (so walk counts grow).
 * De-dupes `ids` so a doubled loop segment isn't logged twice for one túra.
 */
export function markWalked(profile: Profile, keys: Iterable<string>, at: number = Date.now()): Profile {
  const walks: Record<string, number[]> = { ...profile.walks };
  for (const key of new Set(keys)) {
    walks[key] = [...(walks[key] ?? []), at];
  }
  return { walks };
}

/** Has this segment ever been walked? */
export function isWalked(profile: Profile, key: string): boolean {
  return (profile.walks[key]?.length ?? 0) > 0;
}

/** When was this segment last walked (epoch ms), or undefined if never. */
export function lastWalked(profile: Profile, key: string): number | undefined {
  const ts = profile.walks[key];
  return ts && ts.length ? ts[ts.length - 1] : undefined;
}

/** How many times this segment has been walked (0 if never). */
export function walkCount(profile: Profile, key: string): number {
  return profile.walks[key]?.length ?? 0;
}

/** Number of distinct segments walked at least once — the quiet "covered" tally. */
export function distinctWalkedCount(profile: Profile): number {
  return Object.values(profile.walks).filter((ts) => ts.length > 0).length;
}
