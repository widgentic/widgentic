import { describe, expect, it } from "vitest";
import { RESOURCE_LIMIT, parseResource, parseResources, resourceCovered, resourceHost } from "../resources.js";
import type { Resource } from "../resources.js";

const ICONS = "https://fonts.googleapis.com/icon?family=Material+Icons";
const SRI = "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC";

function accepted(entry: unknown): Resource {
  const parsed = parseResource(entry);
  if ("error" in parsed) throw new Error(`${JSON.stringify(entry)} was refused: ${parsed.error}`);
  return parsed.resource;
}

function refusal(entry: unknown): string {
  const parsed = parseResource(entry);
  if (!("error" in parsed)) throw new Error(`${JSON.stringify(entry)} was accepted as ${parsed.resource.href}`);
  return parsed.error;
}

const sheet = (href: string, extra: Record<string, unknown> = {}) => ({ type: "stylesheet", href, ...extra });

describe("parseResource", () => {
  it("accepts an https stylesheet, lowercasing only the host", () => {
    expect(accepted(sheet("https://Fonts.Googleapis.com/icon?family=Material+Icons"))).toEqual({ type: "stylesheet", href: ICONS });
    expect(accepted(sheet("  https://cdn.example.org/Brand.css#v2 "))).toEqual({ type: "stylesheet", href: "https://cdn.example.org/Brand.css#v2" });
    expect(accepted(sheet("https://cdn.example.org"))).toEqual({ type: "stylesheet", href: "https://cdn.example.org" });
    expect(parseResource(sheet(ICONS))).toMatchObject({ host: "fonts.googleapis.com" });
  });

  it("keeps a well-formed integrity value, one digest or several", () => {
    expect(accepted(sheet("https://cdn.example.org/a.css", { integrity: SRI })).integrity).toBe(SRI);
    const two = `sha256-${"A".repeat(43)}= sha512-${"b".repeat(86)}==`;
    expect(accepted(sheet("https://cdn.example.org/a.css", { integrity: two })).integrity).toBe(two);
  });

  it("refuses every address a frame policy or an attribute could not hold", () => {
    expect(refusal(sheet("http://cdn.example.org/a.css"))).toContain("https://");
    expect(refusal(sheet("https://user:pw@cdn.example.org/a.css"))).toContain("user name");
    expect(refusal(sheet("https://cdn.example.org:8443/a.css"))).toContain("port");
    expect(refusal(sheet("https://192.168.1.10/a.css"))).toContain("IP address");
    expect(refusal(sheet("https://[::1]/a.css"))).toContain("IP address");
    expect(refusal(sheet("https://localhost/a.css"))).toContain("localhost");
    expect(refusal(sheet("https://*.example.org/a.css"))).toContain("wildcard");
    expect(refusal(sheet("javascript:alert(1)"))).toContain("https://");
    expect(refusal(sheet('https://cdn.example.org/a.css" onload="x'))).toContain("quote");
    expect(refusal(sheet("https://cdn.example.org/a b.css"))).toContain("space");
    expect(refusal(sheet("https://cdn.example.org/<x>.css"))).toContain("'<'");
    expect(refusal(sheet("https://cdn.example.org/ä.css"))).toContain("non-ASCII");
    expect(refusal(sheet(`https://cdn.example.org/${"a".repeat(2048)}`))).toContain("2048");
    expect(refusal(sheet(""))).toContain("empty");
  });

  it("refuses a bad integrity, another type, an unknown field and a non-object", () => {
    expect(refusal(sheet("https://cdn.example.org/a.css", { integrity: "md5-abc" }))).toContain("integrity");
    expect(refusal(sheet("https://cdn.example.org/a.css", { integrity: 42 }))).toContain("integrity");
    expect(refusal({ type: "script", href: "https://cdn.example.org/x.js" })).toContain("only stylesheets");
    expect(refusal({ href: "https://cdn.example.org/a.css" })).toContain('"stylesheet"');
    expect(refusal(sheet("https://cdn.example.org/a.css", { media: "print" }))).toContain("'media'");
    expect(refusal({ type: "stylesheet", href: 42 })).toContain("string");
    expect(refusal("https://cdn.example.org/a.css")).toContain("object");
  });
});

describe("parseResources", () => {
  it("keeps order, drops repeats by href and reports each refusal", () => {
    const { resources, refused } = parseResources([
      sheet("https://Fonts.Googleapis.com/icon?family=Material+Icons"),
      sheet("https://cdn.example.org/brand.css", { integrity: SRI }),
      sheet(ICONS),
      { type: "script", href: "https://cdn.example.org/x.js" }
    ]);
    expect(resources.map((resource) => resource.href)).toEqual([ICONS, "https://cdn.example.org/brand.css"]);
    expect(refused).toHaveLength(1);
    expect(refused[0]?.error).toContain("only stylesheets");
  });

  it("states its limit", () => {
    expect(RESOURCE_LIMIT).toBe(8);
  });
});

describe("resourceCovered", () => {
  it("covers a host exactly, or any subdomain under a wildcard, never the wildcard's apex", () => {
    expect(resourceHost(ICONS)).toBe("fonts.googleapis.com");
    expect(resourceCovered(ICONS, ["fonts.googleapis.com"])).toBe(true);
    expect(resourceCovered(ICONS, ["https://fonts.googleapis.com"])).toBe(true);
    expect(resourceCovered(ICONS, ["fonts.gstatic.com"])).toBe(false);
    expect(resourceCovered("https://cdn.example.org/a.css", ["*.example.org"])).toBe(true);
    expect(resourceCovered("https://a.b.example.org/a.css", ["*.example.org"])).toBe(true);
    expect(resourceCovered("https://example.org/a.css", ["*.example.org"])).toBe(false);
    expect(resourceCovered(ICONS, [])).toBe(false);
  });

  it("ignores a refused domain entry", () => {
    expect(resourceCovered(ICONS, ["http://fonts.googleapis.com"])).toBe(false);
  });
});
