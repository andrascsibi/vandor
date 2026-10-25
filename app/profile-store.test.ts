import { describe, it, expect } from "vitest";
import { localProfileStore } from "./profile-store.ts";
import { emptyProfile, markWalked } from "./profile.ts";

/** An in-memory Storage-like for tests. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    _map: map,
  };
}

describe("localProfileStore", () => {
  it("round-trips a profile", () => {
    const storage = fakeStorage();
    const store = localProfileStore("k", storage);
    const p = markWalked(emptyProfile(), ["a", "b"], 1000);
    store.save(p);
    expect(localProfileStore("k", storage).load()).toEqual(p);
  });

  it("returns an empty profile when nothing is stored", () => {
    expect(localProfileStore("k", fakeStorage()).load()).toEqual(emptyProfile());
  });

  it("returns empty (never throws) on malformed JSON", () => {
    const store = localProfileStore("k", fakeStorage({ k: "{not json" }));
    expect(store.load()).toEqual(emptyProfile());
  });

  it("drops entries that aren't numeric-timestamp arrays", () => {
    const storage = fakeStorage({ k: JSON.stringify({ walks: { ab: [1000], cd: "nope", ef: ["x"] } }) });
    expect(localProfileStore("k", storage).load()).toEqual({ walks: { ab: [1000] } });
  });

  it("degrades to empty when no storage is available", () => {
    const store = localProfileStore("k", null);
    expect(store.load()).toEqual(emptyProfile());
    expect(() => store.save(emptyProfile())).not.toThrow();
  });
});
