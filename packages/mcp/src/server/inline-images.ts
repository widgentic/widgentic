/**
 * Server-side image inlining for iframe-facing render surfaces.
 *
 * Apps-host sandboxes block external `img-src` while universally allowing
 * `data:` (observed live: basic-host emits `img-src 'self' data: blob:`),
 * so the runnable server fetches image bytes at render time and rewrites
 * `img` sources to `data:<type>;base64,` URIs — but only on the surfaces a
 * sandboxed iframe renders (the structuredContent fragment and the `ui://`
 * embedded resource). Model-facing HTML and `format: "page"` keep URLs.
 *
 * The fetch is SSRF-guarded: https only, private/reserved addresses
 * rejected on every redirect hop, `image/*` content type required, byte
 * and time caps. Per render, sources are fetched in shape priority (hero,
 * then thumbs/avatars/template images, then icons) up to a count cap, and
 * admitted while the bytes they substitute — charged per occurrence — fit
 * a budget. DNS is resolved once and
 * the connection pinned to the checked address (guarded-fetch), so a
 * rebinding resolver cannot swap in a private target between check and use.
 */
import type { WidgetElementNode, WidgetNode } from "@widgentic/core";
import { WIDGENTIC_APP_MIME_TYPE } from "./definitions.js";
import {
  defaultLookup,
  pinnedHttpsFetch,
  resolvePublicAddress
} from "./guarded-fetch.js";
import type { Lookup, PinnedFetch } from "./guarded-fetch.js";

const REDIRECT_LIMIT = 3;
const TIMEOUT_MS = 4000;
const MAX_BYTES = 1024 * 1024;
// 24: sized for per-row table avatars (a 10-20 row contact table is a
// normal render), not just card heroes. Overflow keeps original URLs —
// deterministic first-N in document order — which sandboxed frames show
// as alt text. Fetches run in parallel under the per-image 1 MiB / 4 s
// guards, so the cap bounds memory, not wall-clock.
const MAX_IMAGES_PER_RENDER = 24;
// Bytes SUBSTITUTED per render, charged per occurrence: a source costs its
// data URI's length times the number of images using it. 3 MiB fits two
// images at the 1 MiB fetch cap and stops one repeated icon multiplying
// through a large tree.
const MAX_INLINE_BYTES_PER_RENDER = 3 * 1024 * 1024;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 50;

/** Injectable dependencies so tests can run without network or DNS. */
export interface InlineImageDeps {
  fetchImpl?: PinnedFetch;
  /** Resolve a hostname to its addresses (defaults to node:dns lookup). */
  lookupImpl?: Lookup;
  /**
   * Deployment-declared resource domains (lowercased hostnames): sources
   * on these hosts are left un-inlined — the frame is allowed to load
   * them natively per the Apps declaration. Deployment config only.
   */
  skipHosts?: ReadonlySet<string>;
}

/** True when a raw http(s) URL's hostname is a declared resource domain. */
function isDeclaredHost(rawUrl: string, skipHosts: ReadonlySet<string> | undefined): boolean {
  if (skipHosts === undefined || skipHosts.size === 0) return false;
  try {
    return skipHosts.has(new URL(rawUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

const cache = new Map<string, { value: string; expires: number }>();

/** Test hook: reset the module-level success cache. */
export function clearInlineImageCache(): void {
  cache.clear();
}

/**
 * Fetch one image and return it as a `data:` URI, or `null` when any guard
 * or the fetch itself fails. Never throws.
 */
export async function fetchImageAsDataUri(
  url: string,
  deps: InlineImageDeps = {}
): Promise<string | null> {
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.value;

  const fetchImpl = deps.fetchImpl ?? pinnedHttpsFetch;
  const lookupImpl = deps.lookupImpl ?? defaultLookup;

  let current = url;
  for (let hop = 0; hop <= REDIRECT_LIMIT; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:") return null;
    const pinned = await resolvePublicAddress(parsed, lookupImpl);
    if (pinned === undefined) return null;

    let response: Response;
    try {
      response = await fetchImpl(parsed.href, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        timeoutMs: TIMEOUT_MS,
        headers: { accept: "image/*" },
        address: pinned.address,
        family: pinned.family
      });
    } catch {
      return null;
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (location === null || hop === REDIRECT_LIMIT) return null;
      current = new URL(location, parsed).href;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (contentType === undefined || !contentType.startsWith("image/")) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }

    if (response.body === null) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          return null;
        }
        chunks.push(value);
      }
    } catch {
      return null;
    }

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const dataUri = `data:${contentType};base64,${Buffer.from(merged).toString("base64")}`;

    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(url, { value: dataUri, expires: Date.now() + CACHE_TTL_MS });
    return dataUri;
  }
  return null;
}

/** Reverse of the serializer's attribute escaping (widgentic-emitted HTML only). */
function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const IMG_TAG = /<img\b[^>]*>/g;
const SRC_ATTR = /\bsrc="([^"]*)"/;

const CLASS_ATTR = /\bclass="([^"]*)"/;

/** One `img` use of a source, with its fetch priority. */
interface Occurrence {
  url: string;
  rank: number;
}

/**
 * Fetch priority from an image's classes: card heroes first, decorative
 * tree icons last, everything else (thumbs, avatars, template images) in
 * between.
 */
function shapeRank(classes: string | undefined): number {
  const list = (classes ?? "").split(/\s+/);
  if (list.some((name) => name === "wg-img-hero")) return 3;
  if (list.some((name) => name === "wg-img-icon")) return 1;
  return 2;
}

function htmlOccurrences(html: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const tag of html.match(IMG_TAG) ?? []) {
    const src = SRC_ATTR.exec(tag)?.[1];
    if (src === undefined) continue;
    const url = unescapeAttr(src);
    if (/^https?:\/\//i.test(url)) out.push({ url, rank: shapeRank(CLASS_ATTR.exec(tag)?.[1]) });
  }
  return out;
}

/**
 * Decide what to inline: unique sources ranked by their best occurrence
 * (ties in document order), the first {@link MAX_IMAGES_PER_RENDER}
 * fetched, then admitted in that order while their substituted bytes fit
 * {@link MAX_INLINE_BYTES_PER_RENDER} — a source that does not fit keeps
 * its URL and a smaller later one may still be admitted. Sources left
 * external by either bound are counted on stderr, never by URL.
 */
async function resolveSources(
  occurrences: Occurrence[],
  deps: InlineImageDeps
): Promise<Map<string, string>> {
  const byUrl = new Map<string, { url: string; rank: number; first: number; count: number }>();
  occurrences.forEach(({ url, rank }, index) => {
    if (isDeclaredHost(url, deps.skipHosts)) return;
    const seen = byUrl.get(url);
    if (seen === undefined) byUrl.set(url, { url, rank, first: index, count: 1 });
    else {
      seen.count++;
      seen.rank = Math.max(seen.rank, rank);
    }
  });
  const ranked = [...byUrl.values()].sort((a, b) => b.rank - a.rank || a.first - b.first);
  const fetched = ranked.slice(0, MAX_IMAGES_PER_RENDER);
  const uris = await Promise.all(fetched.map((source) => fetchImageAsDataUri(source.url, deps)));
  const admitted = new Map<string, string>();
  let used = 0;
  let overBudget = 0;
  fetched.forEach((source, i) => {
    const uri = uris[i];
    if (uri === null || uri === undefined) return;
    const cost = uri.length * source.count;
    if (used + cost > MAX_INLINE_BYTES_PER_RENDER) {
      overBudget++;
      return;
    }
    used += cost;
    admitted.set(source.url, uri);
  });
  const overCap = ranked.length - fetched.length;
  if (overCap + overBudget > 0) {
    console.error(
      `widgentic: ${overCap + overBudget} image source(s) left external (fetch cap: ${overCap}, byte budget: ${overBudget})`
    );
  }
  return admitted;
}

/**
 * Rewrite `img src` attributes in widgentic-serialized HTML, replacing each
 * fetchable `http(s)` source with a `data:` URI under the same priority
 * and budgets as a render result. Sources that fail any guard are left
 * untouched (the alt-text fallback remains).
 */
export async function inlineImagesInHtml(
  html: string,
  deps: InlineImageDeps = {}
): Promise<string> {
  const occurrences = htmlOccurrences(html);
  if (occurrences.length === 0) return html;
  const resolved = await resolveSources(occurrences, deps);
  if (resolved.size === 0) return html;
  return html.replace(IMG_TAG, (tag) =>
    tag.replace(SRC_ATTR, (full, src: string) => {
      const dataUri = resolved.get(unescapeAttr(src));
      return dataUri === undefined ? full : `src="${dataUri}"`;
    })
  );
}

function isElementNode(node: unknown): node is WidgetElementNode {
  return typeof node === "object" && node !== null && !Array.isArray(node);
}

/** Collect http(s) img occurrences from a render tree, in document order. */
function treeOccurrences(node: WidgetNode, into: Occurrence[]): Occurrence[] {
  if (!isElementNode(node)) return into;
  if (node.tag === "img") {
    const src = node.attrs?.src;
    if (typeof src === "string" && /^https?:\/\//i.test(src)) {
      into.push({ url: src, rank: shapeRank(node.attrs?.class) });
    }
  }
  for (const child of node.children ?? []) treeOccurrences(child, into);
  return into;
}

/** Rewrite tree img sources in place from resolved raw-URL → data-URI. */
function rewriteTreeImages(node: WidgetNode, resolved: Map<string, string>): void {
  if (!isElementNode(node)) return;
  if (node.tag === "img" && node.attrs !== undefined) {
    const src = node.attrs.src;
    if (typeof src === "string") {
      const dataUri = resolved.get(src);
      if (dataUri !== undefined) node.attrs.src = dataUri;
    }
  }
  for (const child of node.children ?? []) rewriteTreeImages(child, resolved);
}

/**
 * Apply inlining to the iframe-facing surfaces of a `render_widget` result,
 * in place: the `structuredContent.html` fragment, the `structuredContent.tree`
 * render tree, and any embedded resource with the MCP Apps mime type. All
 * surfaces are rewritten from ONE fetch pass, so the tree and html
 * projections can never disagree about an image. Model-facing text blocks
 * keep original URLs.
 */
export async function inlineRenderResultImages(
  result: {
    content?: unknown;
    structuredContent?: Record<string, unknown> | undefined;
    isError?: boolean | undefined;
  },
  deps: InlineImageDeps = {}
): Promise<void> {
  if (result.isError === true) return;

  // HTML-string surfaces (escaped attributes) as get/set accessors.
  const htmlSurfaces: { get(): string; set(value: string): void }[] = [];
  const sc = result.structuredContent;
  if (sc !== undefined && typeof sc.html === "string") {
    htmlSurfaces.push({
      get: () => sc.html as string,
      set: (value) => {
        sc.html = value;
      }
    });
  }
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "resource"
      ) {
        const resource = (block as { resource?: Record<string, unknown> }).resource;
        if (
          resource !== undefined &&
          resource.mimeType === WIDGENTIC_APP_MIME_TYPE &&
          typeof resource.text === "string"
        ) {
          htmlSurfaces.push({
            get: () => resource.text as string,
            set: (value) => {
              resource.text = value;
            }
          });
        }
      }
    }
  }
  const tree = sc?.tree as WidgetNode | undefined;

  // Occurrences come from ONE projection — the tree when present, else the
  // first HTML surface — because every projection carries the same images;
  // every surface is then rewritten from the same decision.
  const first = htmlSurfaces[0];
  const occurrences =
    tree !== undefined ? treeOccurrences(tree, []) : first !== undefined ? htmlOccurrences(first.get()) : [];
  if (occurrences.length === 0) return;
  const resolved = await resolveSources(occurrences, deps);
  if (resolved.size === 0) return;

  for (const surface of htmlSurfaces) {
    surface.set(
      surface.get().replace(IMG_TAG, (tag) =>
        tag.replace(SRC_ATTR, (full, src: string) => {
          const dataUri = resolved.get(unescapeAttr(src));
          return dataUri === undefined ? full : `src="${dataUri}"`;
        })
      )
    );
  }
  if (tree !== undefined) rewriteTreeImages(tree, resolved);
}
