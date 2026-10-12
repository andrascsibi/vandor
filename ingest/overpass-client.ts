// Shared Overpass HTTP client for the fetch scripts (IO layer, not unit-tested).
// Public Overpass mirrors are tried in order — any one is frequently busy
// (504/429 dispatcher timeout) or erroring (500), so we fall through to the next.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

export async function queryOverpass<T>(query: string): Promise<T> {
  let lastErr: unknown;
  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Overpass rejects requests without a User-Agent (HTTP 406).
          "User-Agent": "vandor-hike-suggester/0.0 (personal project; github.com/andras)",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
      }
      console.log(`  via ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      console.warn(`  mirror failed (${url}): ${(err as Error).message}`);
      lastErr = err;
    }
  }
  throw new Error(`all Overpass mirrors failed; last error: ${(lastErr as Error)?.message}`);
}
