// Heavy files (engines, runtimes, models) never come from our own host. The browser downloads them once
// from the first source that works (this repo on GitHub, then public CDNs) and keeps them in Cache Storage,
// so later visits load them locally.

/** Raw files from this repository's models/ folder. */
export const REPO_RAW = 'https://raw.githubusercontent.com/sr2echa/che2s.com/main/models';
/** The same folder through jsDelivr's GitHub CDN. */
export const REPO_CDN = 'https://cdn.jsdelivr.net/gh/sr2echa/che2s.com@main/models';
/** Dev server only: models/ served from disk (see the dev-models plugin in astro.config.mjs), always tried last. */
export const DEV_LOCAL = import.meta.env.DEV && typeof location !== 'undefined' ? `${location.origin}/dev-models` : null; // undefined on the server (Astro SSR)

const CACHE = 'che2s-assets-v1';

/**
 * Returns the asset's bytes. `key` names it in Cache Storage (include a version); `urls` are tried in order.
 * `onProgress` receives 0..100 while downloading when the size is known.
 */
export async function loadAsset(key: string, urls: (string | null | undefined)[], onProgress?: (pct: number) => void, expectedBytes?: number): Promise<Blob> {
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE).catch(() => null) : null;
  const hit = await cache?.match(key);
  if (hit) return hit.blob();
  let lastError: unknown = new Error(`No source for ${key}`);
  for (const url of urls.filter(Boolean) as string[]) {
    try {
      const res = await fetch(url);
      // A blocked or missing file often comes back as an HTML page; treat it as a failure.
      if (!res.ok || res.headers.get('content-type')?.includes('text/html')) throw new Error(`${res.status} from ${url}`);
      const blob = onProgress && res.body ? await withProgress(res, onProgress, expectedBytes) : await res.blob();
      await cache?.put(key, new Response(blob)).catch(() => {}); // storage may be full or unavailable; still usable
      return blob;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

async function withProgress(res: Response, onProgress: (pct: number) => void, expected?: number): Promise<Blob> {
  const total = Number(res.headers.get('content-length')) || expected || 0;
  const reader = res.body!.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let got = 0, shown = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array<ArrayBuffer>);
    got += value.length;
    const pct = total ? Math.min(99, Math.floor((got / total) * 100)) : 0;
    if (pct !== shown) onProgress((shown = pct));
  }
  return new Blob(chunks);
}

/** An object URL for bytes with a given MIME type (workers and runtimes load these like files). */
export const blobUrl = (blob: Blob, type: string) => URL.createObjectURL(new Blob([blob], { type }));
