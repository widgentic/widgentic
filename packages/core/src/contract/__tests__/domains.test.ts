import { describe, expect, it } from "vitest";
import {
  RESOURCE_DOMAIN_LIMIT,
  matchesResourceDomain,
  parseResourceDomain,
  parseResourceDomains
} from "../domains.js";
import type { ResourceDomain } from "../domains.js";

function accepted(input: string): ResourceDomain {
  const parsed = parseResourceDomain(input);
  if ("error" in parsed) throw new Error(`'${input}' was refused: ${parsed.error}`);
  return parsed;
}

function refusal(input: string): string {
  const parsed = parseResourceDomain(input);
  if (!("error" in parsed)) throw new Error(`'${input}' was accepted as ${parsed.origin}`);
  return parsed.error;
}

describe("parseResourceDomain", () => {
  it("accepts a host, a wildcard, and either behind https://, canonically", () => {
    expect(accepted("cdn.example.com")).toEqual({ origin: "https://cdn.example.com", host: "cdn.example.com", wildcard: false });
    expect(accepted("https://cdn.example.com")).toEqual(accepted("cdn.example.com"));
    expect(accepted("*.example.com")).toEqual({ origin: "https://*.example.com", host: "example.com", wildcard: true });
    expect(accepted("https://*.example.org/").origin).toBe("https://*.example.org");
  });

  it("ignores case, surrounding whitespace and one trailing slash", () => {
    expect(accepted("  CDN.Example.COM  ").origin).toBe("https://cdn.example.com");
    expect(accepted("HTTPS://Cdn.Example.com/").origin).toBe("https://cdn.example.com");
  });

  it("accepts punycode and hyphenated labels", () => {
    expect(accepted("xn--exmple-cua.com").origin).toBe("https://xn--exmple-cua.com");
    expect(accepted("my-cdn.example-1.net").host).toBe("my-cdn.example-1.net");
  });

  it("refuses every scheme but https", () => {
    for (const input of ["http://cdn.example.com", "data:image/png", "javascript:alert(1)", "wss://cdn.example.com"]) {
      expect(refusal(input)).toMatch(/https/);
    }
  });

  it("refuses ports, paths, queries, fragments and userinfo", () => {
    expect(refusal("https://cdn.example.com:8443")).toMatch(/port/);
    expect(refusal("cdn.example.com:443")).toMatch(/port/);
    expect(refusal("https://cdn.example.com/img")).toMatch(/path/);
    expect(refusal("https://cdn.example.com//")).toMatch(/path/);
    expect(refusal("cdn.example.com?a=1")).toMatch(/query/);
    expect(refusal("cdn.example.com#top")).toMatch(/fragment/);
    expect(refusal("https://user@cdn.example.com")).toMatch(/user/);
  });

  it("refuses IP literals, single labels and localhost names", () => {
    expect(refusal("192.168.1.10")).toMatch(/IP address/);
    expect(refusal("https://10.0.0.1")).toMatch(/IP address/);
    expect(refusal("[::1]")).toMatch(/IP address/);
    expect(refusal("https://[2001:db8::1]")).toMatch(/IP address/);
    expect(refusal("localhost")).toMatch(/single-label/);
    expect(refusal("intranet")).toMatch(/single-label/);
    expect(refusal("app.localhost")).toMatch(/localhost/);
    expect(refusal("cdn.example.123")).toMatch(/number/);
  });

  it("allows a wildcard only as the whole first label, before two or more labels", () => {
    expect(refusal("*")).toMatch(/wildcard/);
    expect(refusal("https://*")).toMatch(/wildcard/);
    expect(refusal("*.com")).toMatch(/two labels/);
    expect(refusal("a.*.example.com")).toMatch(/first label/);
    expect(refusal("*cdn.example.com")).toMatch(/first label/);
    expect(refusal("*.*.example.com")).toMatch(/first label/);
  });

  it("refuses anything that could end a CSP source expression", () => {
    for (const input of ["cdn.example.com; script-src *", "cdn.example.com,evil.example", "'self'", "\"cdn.example.com\"", "cdn.example.com evil.example", "cdn.example.com\tx"]) {
      expect(refusal(input)).toMatch(/space|quote/);
    }
  });

  it("refuses non-ASCII hosts and points at punycode", () => {
    expect(refusal("exämple.com")).toMatch(/punycode/);
  });

  it("bounds labels and the host length", () => {
    expect(refusal("-cdn.example.com")).toMatch(/label '-cdn'/);
    expect(refusal("cdn-.example.com")).toMatch(/label 'cdn-'/);
    expect(refusal("cdn_1.example.com")).toMatch(/label 'cdn_1'/);
    expect(refusal("cdn..example.com")).toMatch(/empty label/);
    expect(refusal(`${"a".repeat(64)}.example.com`)).toMatch(/label/);
    expect(accepted(`${"a".repeat(63)}.example.com`).host).toHaveLength(75);
    const long = Array.from({ length: 64 }, () => "abc").join(".");
    expect(refusal(long)).toMatch(/253/);
    expect(refusal("   ")).toMatch(/empty/);
  });
});

describe("parseResourceDomains", () => {
  it("deduplicates by canonical origin in first-seen order and lists refusals", () => {
    const { domains, refused } = parseResourceDomains([
      "CDN.Example.com",
      "https://*.example.org/",
      "https://cdn.example.com",
      "http://old.example.com"
    ]);
    expect(domains.map((domain) => domain.origin)).toEqual(["https://cdn.example.com", "https://*.example.org"]);
    expect(refused).toEqual([{ entry: "http://old.example.com", error: "only https:// domains can be declared" }]);
  });

  it("exports the list limit", () => {
    expect(RESOURCE_DOMAIN_LIMIT).toBe(20);
  });
});

describe("matchesResourceDomain", () => {
  it("matches an exact host only", () => {
    const exact = accepted("cdn.example.com");
    expect(matchesResourceDomain("cdn.example.com", exact)).toBe(true);
    expect(matchesResourceDomain("CDN.EXAMPLE.COM", exact)).toBe(true);
    expect(matchesResourceDomain("a.cdn.example.com", exact)).toBe(false);
    expect(matchesResourceDomain("example.com", exact)).toBe(false);
  });

  it("matches a wildcard's subdomains at any depth, never its apex", () => {
    const wildcard = accepted("*.example.com");
    expect(matchesResourceDomain("a.example.com", wildcard)).toBe(true);
    expect(matchesResourceDomain("a.b.example.com", wildcard)).toBe(true);
    expect(matchesResourceDomain("example.com", wildcard)).toBe(false);
    expect(matchesResourceDomain("badexample.com", wildcard)).toBe(false);
  });
});
