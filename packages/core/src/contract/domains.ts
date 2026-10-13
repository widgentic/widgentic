/**
 * Resource domains: the origins an MCP Apps frame may load assets from
 * directly, declared as the app resource's `_meta.ui.csp.resourceDomains`.
 * One rule for every door — the store, the settings designer, the server
 * assembly and the host bundle — narrower than CSP's own grammar: https
 * only, a host of two or more DNS labels with an optional leading `*.`
 * wildcard, and no port, path, userinfo or IP literal. Hosts build their
 * frame CSP by joining the entries, so nothing that could end a source
 * expression (whitespace, `;`, `,`, quotes) ever passes. Checked label by
 * label over ASCII, never through `URL`, so every runtime reads an entry
 * alike.
 */

/** The most domains one list may declare. */
export const RESOURCE_DOMAIN_LIMIT = 20;

export interface ResourceDomain {
  /** The canonical origin: `https://cdn.example.com` or `https://*.example.com`. */
  origin: string;
  /** The host without its wildcard label: `cdn.example.com`, `example.com`. */
  host: string;
  /** `*.host`: every subdomain of `host`, at any depth, never `host` itself. */
  wildcard: boolean;
}

/** An accepted entry, or why it is refused (a short clause a person can read). */
export type ResourceDomainResult = ResourceDomain | { error: string };

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function hostProblem(host: string, wildcard: boolean): string | undefined {
  if (host.length > 253) return "the host is longer than 253 characters";
  const labels = host.split(".");
  if (labels.some((label) => label.length === 0)) return "the host has an empty label";
  if (labels.every((label) => /^\d+$/.test(label))) return "an IP address cannot be declared, only a domain name";
  if (labels.length < 2) {
    return wildcard
      ? "a wildcard needs at least two labels after it, as in *.example.com"
      : "a single-label host such as localhost cannot be declared";
  }
  if (labels[labels.length - 1] === "localhost") return "a localhost name cannot be declared";
  if (/^\d+$/.test(labels[labels.length - 1] ?? "")) return "the last label is a number, so this is not a domain name";
  const bad = labels.find((label) => !LABEL.test(label));
  if (bad !== undefined) {
    return `the label '${bad}' is not 1-63 letters, digits or hyphens that start and end with a letter or digit`;
  }
  return undefined;
}

/**
 * Read one entry: `host`, `*.host`, or either behind `https://`, with at
 * most one trailing `/`. Case and surrounding whitespace are ignored.
 */
export function parseResourceDomain(input: string): ResourceDomainResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { error: "it is empty" };
  if (/[\s;,'"`]/.test(trimmed)) return { error: "it contains a space, ';', ',' or a quote, which no domain holds" };
  if (/[^\x21-\x7e]/.test(trimmed)) return { error: "it has a non-ASCII character: enter the punycode (xn--) form" };
  const lower = trimmed.toLowerCase();

  let rest = lower;
  if (lower.startsWith("https://")) {
    rest = lower.slice("https://".length);
  } else if (/^[a-z][a-z0-9+.-]*:(?!\d+\/?$)/.test(lower)) {
    // A scheme other than https (`http://`, `data:`, `javascript:`); a
    // `host:8443` falls through to the port check instead.
    return { error: "only https:// domains can be declared" };
  }
  if (rest.endsWith("/")) rest = rest.slice(0, -1);
  if (rest.includes("@")) return { error: "it carries a user name, which a domain cannot" };
  if (rest.includes("/")) return { error: "it is a page, not a domain: drop the path" };
  if (rest.includes("?") || rest.includes("#")) return { error: "it carries a query or fragment, which a domain cannot" };
  if (rest.startsWith("[")) return { error: "an IP address cannot be declared, only a domain name" };
  if (rest.includes(":")) return { error: "it names a port, which a domain cannot" };

  const wildcard = rest.startsWith("*.");
  const host = wildcard ? rest.slice(2) : rest;
  if (host.includes("*")) return { error: "a wildcard may only be the whole first label, as in *.example.com" };
  const problem = hostProblem(host, wildcard);
  if (problem !== undefined) return { error: problem };
  return { origin: `https://${wildcard ? "*." : ""}${host}`, host, wildcard };
}

/**
 * Read a list: the accepted domains, deduplicated by canonical origin in
 * first-seen order, and each refused entry with its reason.
 */
export function parseResourceDomains(entries: readonly string[]): {
  domains: ResourceDomain[];
  refused: { entry: string; error: string }[];
} {
  const domains: ResourceDomain[] = [];
  const refused: { entry: string; error: string }[] = [];
  for (const entry of entries) {
    const parsed = parseResourceDomain(entry);
    if ("error" in parsed) refused.push({ entry, error: parsed.error });
    else if (!domains.some((domain) => domain.origin === parsed.origin)) domains.push(parsed);
  }
  return { domains, refused };
}

/** Whether `hostname` falls under `domain`, as a CSP host source matches it. */
export function matchesResourceDomain(hostname: string, domain: ResourceDomain): boolean {
  const host = hostname.toLowerCase();
  return domain.wildcard ? host.endsWith(`.${domain.host}`) : host === domain.host;
}
