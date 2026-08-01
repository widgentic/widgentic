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
import { WIDGENTIC_APP_MIME_TYPE } from "./definitions.js";

const REDIRECT_LIMIT = 3;
const TIMEOUT_MS = 4000;
const MAX_BYTES = 1024 * 1024;
const MAX_IMAGES_PER_RENDER = 8;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 50;

/** Injectable dependencies so tests can run without network or DNS. */
export interface InlineImageDeps {
  fetchImpl?: typeof fetch;
  /** Resolve a hostname to its addresses (defaults to node:dns lookup). */
  lookupImpl?: (hostname: string) => Promise<string[]>;
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

/** Reject URLs whose host is (or resolves to) a non-public address. */
async function assertPublicHost(
  url: URL,
  lookupImpl: (hostname: string) => Promise<string[]>
): Promise<boolean> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(host)) return !isPrivateAddress(host);
  try {
    const addresses = await lookupImpl(host);
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a));
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

  const fetchImpl = deps.fetchImpl ?? fetch;
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
    if (!(await assertPublicHost(parsed, lookupImpl))) return null;

    let response: Response;
    try {
      response = await fetchImpl(parsed.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: "image/*" }
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

/**
 * Apply inlining to the iframe-facing surfaces of a `render_widget` result,
 * in place: the `structuredContent.html` fragment and any embedded resource
 * with the MCP Apps mime type. Model-facing text blocks keep original URLs.
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

  const fragment = result.structuredContent?.html;
  if (typeof fragment === "string" && result.structuredContent !== undefined) {
    result.structuredContent.html = await inlineImagesInHtml(fragment, deps);
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
          resource.text = await inlineImagesInHtml(resource.text, deps);
        }
      }
    }
  }
}
