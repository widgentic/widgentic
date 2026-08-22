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
 * and time caps, bounded image count per render. Residual DNS-rebinding
 * TOCTOU is accepted at this stage (documented in the change design).
 */
import type { WidgetElementNode, WidgetNode } from "../catalog/index.js";
import { WIDGENTIC_APP_MIME_TYPE } from "./definitions.js";

const REDIRECT_LIMIT = 3;
const TIMEOUT_MS = 4000;
const MAX_BYTES = 1024 * 1024;
// 24: sized for per-row table avatars (a 10-20 row contact table is a
// normal render), not just card heroes. Overflow keeps original URLs —
// deterministic first-N in document order — which sandboxed frames show
// as alt text. Fetches run in parallel under the per-image 1 MiB / 4 s
// guards, so the cap bounds memory, not wall-clock.
const MAX_IMAGES_PER_RENDER = 24;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 50;

/**
 * Request init for the pinned transport: `address`/`family` name the exact
 * validated socket target. The default transport MUST connect there; test
 * fakes (which are plain fetch-shaped) may ignore them.
 */
export interface PinnedRequestInit extends RequestInit {
  address: string;
  family: 4 | 6;
}

/** Injectable dependencies so tests can run without network or DNS. */
export interface InlineImageDeps {
  fetchImpl?: (url: string, init: PinnedRequestInit) => Promise<Response>;
  /** Resolve a hostname to its addresses (defaults to node:dns lookup). */
  lookupImpl?: (hostname: string) => Promise<string[]>;
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

/** True for loopback, private, link-local, CGNAT, and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1] !== undefined) return isPrivateAddress(mapped[1]);

  if (address.includes(":")) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    // fc00::/7 (unique local) and fe80::/10 (link local).
    return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // unparsable — treat as unsafe
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast + reserved + broadcast
  );
}

function isIpLiteral(hostname: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":");
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const { lookup } = await import("node:dns/promises");
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

/**
 * Reject URLs whose host is (or resolves to) a non-public address; on
 * success return the exact address the connection must be PINNED to.
 * Handing the validated address to the transport (instead of letting it
 * re-resolve the name) is what closes the DNS-rebinding window between
 * check and connect.
 */
async function resolvePublicAddress(
  url: URL,
  lookupImpl: (hostname: string) => Promise<string[]>
): Promise<{ address: string; family: 4 | 6 } | undefined> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(host)) {
    return isPrivateAddress(host)
      ? undefined
      : { address: host, family: host.includes(":") ? 6 : 4 };
  }
  try {
    const addresses = await lookupImpl(host);
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a))) {
      return undefined;
    }
    const first = addresses[0] as string;
    return { address: first, family: first.includes(":") ? 6 : 4 };
  } catch {
    return undefined;
  }
}

/**
 * Default transport: HTTPS via node:https with the socket target fixed to
 * the validated address — the custom `lookup` never consults DNS, so a
 * rebinding answer between validation and connection has nothing to bind
 * to. TLS servername and the Host header stay the URL hostname, keeping
 * certificate validation intact. Redirects are NOT followed here (the
 * caller's hop loop re-validates and re-pins each one).
 */
async function pinnedHttpsFetch(url: string, init: PinnedRequestInit): Promise<Response> {
  const { request } = await import("node:https");
  const { Readable } = await import("node:stream");
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        headers: { accept: "image/*" },
        family: init.family,
        lookup: (_hostname, _options, callback) => {
          (callback as (err: null, address: string, family: number) => void)(
            null,
            init.address,
            init.family
          );
        },
        timeout: TIMEOUT_MS
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const headers = new Headers();
        for (const name of ["content-type", "content-length", "location"]) {
          const value = res.headers[name];
          if (typeof value === "string") headers.set(name, value);
        }
        const bodyless = status < 200 || [204, 205, 304].includes(status);
        const body = bodyless
          ? (res.resume(), null)
          : (Readable.toWeb(res) as unknown as BodyInit);
        resolve(new Response(body, { status, headers }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("image fetch timed out")));
    req.on("error", reject);
    req.end();
  });
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
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
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

/**
 * Rewrite `img src` attributes in widgentic-serialized HTML, replacing each
 * fetchable `http(s)` source with a `data:` URI. Sources that fail any
 * guard are left untouched (the alt-text fallback remains). At most
 * {@link MAX_IMAGES_PER_RENDER} unique URLs are fetched, in parallel.
 */
export async function inlineImagesInHtml(
  html: string,
  deps: InlineImageDeps = {}
): Promise<string> {
  const sources = new Set<string>();
  for (const tag of html.match(IMG_TAG) ?? []) {
    const src = SRC_ATTR.exec(tag)?.[1];
    if (src !== undefined && /^https?:\/\//i.test(unescapeAttr(src))) {
      if (isDeclaredHost(unescapeAttr(src), deps.skipHosts)) continue;
      sources.add(src);
      if (sources.size >= MAX_IMAGES_PER_RENDER) break;
    }
  }
  if (sources.size === 0) return html;

  const resolved = new Map<string, string>();
  await Promise.all(
    [...sources].map(async (src) => {
      const dataUri = await fetchImageAsDataUri(unescapeAttr(src), deps);
      if (dataUri !== null) resolved.set(src, dataUri);
    })
  );
  if (resolved.size === 0) return html;

  return html.replace(IMG_TAG, (tag) =>
    tag.replace(SRC_ATTR, (full, src: string) => {
      const dataUri = resolved.get(src);
      return dataUri === undefined ? full : `src="${dataUri}"`;
    })
  );
}

function isElementNode(node: unknown): node is WidgetElementNode {
  return typeof node === "object" && node !== null && !Array.isArray(node);
}

/** Collect raw http(s) img sources from a render tree. */
function collectTreeSources(node: WidgetNode, into: Set<string>): void {
  if (!isElementNode(node)) return;
  if (node.tag === "img") {
    const src = node.attrs?.src;
    if (typeof src === "string" && /^https?:\/\//i.test(src)) into.add(src);
  }
  for (const child of node.children ?? []) collectTreeSources(child, into);
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

  // One collection pass over every surface, keyed by RAW url.
  const raw = new Set<string>();
  for (const surface of htmlSurfaces) {
    for (const tag of surface.get().match(IMG_TAG) ?? []) {
      const src = SRC_ATTR.exec(tag)?.[1];
      if (src !== undefined) {
        const unescaped = unescapeAttr(src);
        if (/^https?:\/\//i.test(unescaped)) raw.add(unescaped);
      }
    }
  }
  if (tree !== undefined) collectTreeSources(tree, raw);
  for (const url of raw) {
    if (isDeclaredHost(url, deps.skipHosts)) raw.delete(url);
  }
  if (raw.size === 0) return;

  // One fetch pass (bounded), then rewrite every projection from it.
  const resolved = new Map<string, string>();
  await Promise.all(
    [...raw].slice(0, MAX_IMAGES_PER_RENDER).map(async (url) => {
      const dataUri = await fetchImageAsDataUri(url, deps);
      if (dataUri !== null) resolved.set(url, dataUri);
    })
  );
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
