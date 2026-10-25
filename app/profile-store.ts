// Where the Vándor's personal profile is persisted. Today: browser localStorage —
// simplest thing that survives a reload. The feature talks to the `ProfileStore`
// interface, never to localStorage directly, so the backend is swappable.
//
// Deferred options (Andras, 2026-10-25 — decided persistence later, localStorage
// for now), noted here so we don't re-derive them:
//   • localStorage is per-device + per-browser and dies on a cache clear. Fine to
//     start; not where personal history should ultimately live.
//   • Vándor is a *public static site* (GitHub Pages, base "/vandor/"), so it can
//     hold NO write secret — a PAT / Supabase / Firebase key in the bundle is
//     view-source-able. That rules out any store needing an embedded token.
//   • Encryption and storage are independent. Encrypt client-side (WebCrypto
//     AES-GCM, key from a passphrase via PBKDF2) and the backend only ever sees
//     ciphertext — then the backend is a dumb detail.
//   • Next step up (persistence, no sync): encrypted export/import file the user
//     owns (download `vandor-profil.enc`, keep it in iCloud/Drive — the synced
//     folder is the sync).
//   • Full zero-knowledge sync: a ~20-line Cloudflare Worker + KV (or Val Town /
//     Deno Deploy) — PUT/GET an opaque blob by random id; only secret is the
//     passphrase in the user's head. Safe even from a public static app.
// See the chat/backlog note for the fuller write-up.

import { emptyProfile, type Profile } from "./profile.ts";

/** Load/save the whole profile. Deliberately tiny so alternate backends drop in. */
export interface ProfileStore {
  load(): Profile;
  save(profile: Profile): void;
}

const DEFAULT_KEY = "vandor.profile.v1";

/** Minimal Storage surface we use — lets tests pass a fake, and guards SSR/node. */
type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // some privacy modes throw on access
  }
}

/**
 * A `ProfileStore` backed by `localStorage` (or any injected `StorageLike`).
 * Reads are defensive: missing / malformed / wrong-shape data yields an empty
 * profile rather than throwing, so a bad blob never bricks the app. If no storage
 * is available it degrades to in-memory-for-this-session (load returns empty).
 */
export function localProfileStore(key: string = DEFAULT_KEY, storage: StorageLike | null = defaultStorage()): ProfileStore {
  return {
    load(): Profile {
      if (!storage) return emptyProfile();
      let raw: string | null = null;
      try {
        raw = storage.getItem(key);
      } catch {
        return emptyProfile();
      }
      if (!raw) return emptyProfile();
      try {
        const parsed = JSON.parse(raw) as unknown;
        const walks = (parsed as Profile | undefined)?.walks;
        if (!walks || typeof walks !== "object") return emptyProfile();
        // Keep only well-formed numeric-timestamp arrays.
        const clean: Record<number, number[]> = {};
        for (const [id, ts] of Object.entries(walks)) {
          if (Array.isArray(ts) && ts.every((t) => typeof t === "number")) {
            clean[Number(id)] = ts as number[];
          }
        }
        return { walks: clean };
      } catch {
        return emptyProfile();
      }
    },
    save(profile: Profile): void {
      if (!storage) return;
      try {
        storage.setItem(key, JSON.stringify(profile));
      } catch {
        // Quota or privacy-mode failure — nothing we can do, don't crash the app.
      }
    },
  };
}
