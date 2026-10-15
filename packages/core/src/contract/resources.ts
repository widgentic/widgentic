/**
 * Stylesheet resources: the stylesheets a principal's MCP Apps frames link,
 * each on a host the declared resource domains cover. One rule for every
 * door — the store, the settings designer, the server assembly, the host
 * bundle and the designers' preview island. An address is read by grammar
 * over ASCII, never through `URL`, so every runtime reads it alike, and
 * nothing that could leave an attribute value (whitespace, quotes, `<`,
 * `>`, a backslash) ever passes. Only stylesheets exist in this version:
 * scripts would let a person's configuration run code in every frame.
 */
import { isPlainObject } from "../shared/plain-object.js";
import { matchesResourceDomain, parseResourceDomain, parseResourceDomains } from "./domains.js";

/** The most resources one list may hold: each is a request in every frame. */
export const RESOURCE_LIMIT = 8;

const HREF_MAX = 2048;
const FIELDS = new Set(["type", "href", "integrity"]);
const DIGEST = "(?:sha256|sha384|sha512)-[A-Za-z0-9+/]+={0,2}";
const INTEGRITY = new RegExp(`^${DIGEST}(?: ${DIGEST})*$`);

export interface StylesheetResource {
  type: "stylesheet";
  /** `https://<host>…`, the host lowercased, the rest as written. */
  href: string;
  /** Subresource Integrity: one or more `sha256|sha384|sha512-<base64>` values. */
  integrity?: string;
}

export type Resource = StylesheetResource;

/** An accepted entry with its host, or why it is refused (a short clause a person can read). */
export type ResourceResult = { resource: Resource; host: string } | { error: string };

function parseHref(input: string): { href: string; host: string } | { error: string } {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { error: "its address is empty" };
  if (trimmed.length > HREF_MAX) return { error: `its address is longer than ${HREF_MAX} characters` };
  if (/[\s"'`<>\\]/.test(trimmed)) return { error: "its address contains a space, a quote, '<', '>' or a backslash" };
  if (/[^\x21-\x7e]/.test(trimmed)) return { error: "its address has a non-ASCII character: percent-encode it" };
  if (!/^https:\/\//i.test(trimmed)) return { error: "only https:// stylesheets can be loaded" };
  const rest = trimmed.slice("https://".length);
  const end = rest.search(/[/?#]/);
  const authority = end === -1 ? rest : rest.slice(0, end);
  const tail = end === -1 ? "" : rest.slice(end);
  if (authority.includes("@")) return { error: "its address carries a user name" };
  if (authority.startsWith("[")) return { error: "its host is an IP address, not a domain name" };
  if (authority.includes(":")) return { error: "its address names a port; only the default https port is declared" };
  if (authority.includes("*")) return { error: "its host is a wildcard, not a domain name" };
  const domain = parseResourceDomain(authority);
  if ("error" in domain) return { error: `its host: ${domain.error}` };
  return { href: `https://${domain.host}${tail}`, host: domain.host };
}

/**
 * Read one entry: `{ type: "stylesheet", href, integrity? }` and nothing
 * else. The host is lowercased; the path, query and fragment are kept as
 * written, since a CDN may serve something else for a rewritten query.
 */
export function parseResource(entry: unknown): ResourceResult {
  if (!isPlainObject(entry)) return { error: "it is not an object of { type, href, integrity? }" };
  const extra = Object.keys(entry).find((key) => !FIELDS.has(key));
  if (extra !== undefined) return { error: `'${extra}' is not a resource field: use type, href and integrity` };
  if (entry.type !== "stylesheet") {
    return {
      error:
        typeof entry.type === "string"
          ? `'${entry.type}' resources are not supported; only stylesheets are`
          : `its type must be "stylesheet"`
    };
  }
  if (typeof entry.href !== "string") return { error: "its href must be a string" };
  const href = parseHref(entry.href);
  if ("error" in href) return href;
  if (entry.integrity === undefined) return { resource: { type: "stylesheet", href: href.href }, host: href.host };
  const integrity = typeof entry.integrity === "string" ? entry.integrity.trim() : "";
  if (!INTEGRITY.test(integrity)) {
    return { error: "its integrity must be one or more sha256-, sha384- or sha512- values followed by base64" };
  }
  return { resource: { type: "stylesheet", href: href.href, integrity }, host: href.host };
}

/**
 * Read a list: the accepted resources, deduplicated by `href` in
 * first-seen order (the order is cascade order), and each refused entry
 * with its reason.
 */
export function parseResources(entries: readonly unknown[]): {
  resources: Resource[];
  refused: { entry: unknown; error: string }[];
} {
  const resources: Resource[] = [];
  const refused: { entry: unknown; error: string }[] = [];
  for (const entry of entries) {
    const parsed = parseResource(entry);
    if ("error" in parsed) refused.push({ entry, error: parsed.error });
    else if (!resources.some((resource) => resource.href === parsed.resource.href)) resources.push(parsed.resource);
  }
  return { resources, refused };
}

/** The host of an accepted resource's `href`. */
export function resourceHost(href: string): string {
  const rest = href.replace(/^https:\/\//i, "");
  const end = rest.search(/[/?#]/);
  return (end === -1 ? rest : rest.slice(0, end)).toLowerCase();
}

/**
 * Whether a resource-domain list (entries in any accepted form) covers the
 * resource's host, as a CSP host source does: exactly, or by a `*.`
 * wildcard for any subdomain, never the wildcard's own apex.
 */
export function resourceCovered(href: string, domains: readonly string[]): boolean {
  const host = resourceHost(href);
  return parseResourceDomains(domains).domains.some((domain) => matchesResourceDomain(host, domain));
}
