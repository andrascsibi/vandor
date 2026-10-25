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

/** A personal walk history: segment id → timestamps (epoch ms) it was walked. */
export interface Profile {
  /** One entry per distinct walked segment; the array lists each walk's time. */
  walks: Record<number, number[]>;
}

export function emptyProfile(): Profile {
  return { walks: {} };
}

/**
 * Record that `ids` were all walked at `at` (defaults to now). Returns a new
 * profile; appends to any existing history for a segment (so walk counts grow).
 * De-dupes `ids` so a doubled loop segment isn't logged twice for one túra.
 */
export function markWalked(profile: Profile, ids: Iterable<number>, at: number = Date.now()): Profile {
  const walks: Record<number, number[]> = { ...profile.walks };
  for (const id of new Set(ids)) {
    walks[id] = [...(walks[id] ?? []), at];
  }
  return { walks };
}

/** Has this segment ever been walked? */
export function isWalked(profile: Profile, id: number): boolean {
  return (profile.walks[id]?.length ?? 0) > 0;
}

/** When was this segment last walked (epoch ms), or undefined if never. */
export function lastWalked(profile: Profile, id: number): number | undefined {
  const ts = profile.walks[id];
  return ts && ts.length ? ts[ts.length - 1] : undefined;
}

/** How many times this segment has been walked (0 if never). */
export function walkCount(profile: Profile, id: number): number {
  return profile.walks[id]?.length ?? 0;
}

/** Number of distinct segments walked at least once — the quiet "covered" tally. */
export function distinctWalkedCount(profile: Profile): number {
  return Object.values(profile.walks).filter((ts) => ts.length > 0).length;
}
