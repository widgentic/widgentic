import { beforeEach, describe, expect, it } from "vitest";
import {
  clearInlineImageCache,
  fetchImageAsDataUri,
  inlineImagesInHtml,
  inlineRenderResultImages
} from "../inline-images.js";
import { isPrivateAddress } from "../guarded-fetch.js";
import type { InlineImageDeps } from "../inline-images.js";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const PNG_B64 = Buffer.from(PNG_BYTES).toString("base64");

/** A fetch stub serving PNG bytes for any URL, recording calls. */
function pngFetch(calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(PNG_BYTES, {
      status: 200,
      headers: { "content-type": "image/png" }
    });
  }) as typeof fetch;
}

const publicLookup = async () => ["93.184.216.34"];
const deps = (fetchImpl: typeof fetch): InlineImageDeps => ({
  fetchImpl,
  lookupImpl: publicLookup
});

beforeEach(() => clearInlineImageCache());

describe("isPrivateAddress", () => {
  it("flags loopback, RFC1918, link-local, CGNAT, and IPv6 local ranges", () => {
    for (const addr of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "255.255.255.255",
      "::1",
      "::",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "::ffff:127.0.0.1"
    ]) {
      expect(isPrivateAddress(addr), addr).toBe(true);
    }
  });

  it("passes public addresses", () => {
    for (const addr of ["93.184.216.34", "8.8.8.8", "2606:2800:220:1::1"]) {
      expect(isPrivateAddress(addr), addr).toBe(false);
    }
  });
});

describe("fetchImageAsDataUri", () => {
  it("returns a data URI for a fetchable https image", async () => {
    const uri = await fetchImageAsDataUri(
      "https://cdn.example/a.png",
      deps(pngFetch())
    );
    expect(uri).toBe(`data:image/png;base64,${PNG_B64}`);
  });

  it("refuses non-https schemes without fetching", async () => {
    const calls: string[] = [];
    expect(
      await fetchImageAsDataUri("http://cdn.example/a.png", deps(pngFetch(calls)))
    ).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("refuses IP-literal and DNS-resolved private hosts without fetching", async () => {
    const calls: string[] = [];
    const fetchImpl = pngFetch(calls);
    expect(
      await fetchImageAsDataUri("https://169.254.169.254/meta.png", {
        fetchImpl,
        lookupImpl: publicLookup
      })
    ).toBeNull();
    expect(
      await fetchImageAsDataUri("https://internal.example/a.png", {
        fetchImpl,
        lookupImpl: async () => ["10.0.0.5"]
      })
    ).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("rejects non-image content types", async () => {
    const fetchImpl = (async () =>
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" }
      })) as typeof fetch;
    expect(
      await fetchImageAsDataUri("https://cdn.example/x.png", deps(fetchImpl))
    ).toBeNull();
  });

  it("rejects oversized responses", async () => {
    const big = new Uint8Array(1024 * 1024 + 1);
    const fetchImpl = (async () =>
      new Response(big, {
        status: 200,
        headers: { "content-type": "image/png" }
      })) as typeof fetch;
    expect(
      await fetchImageAsDataUri("https://cdn.example/big.png", deps(fetchImpl))
    ).toBeNull();
  });

  it("follows bounded redirects, re-validating each hop", async () => {
    let first = true;
    const targets: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      targets.push(String(input));
      if (first) {
        first = false;
        return new Response(null, {
          status: 302,
          headers: { location: "https://cdn2.example/b.png" }
        });
      }
      return new Response(PNG_BYTES, {
        status: 200,
        headers: { "content-type": "image/png" }
      });
    }) as typeof fetch;
    const uri = await fetchImageAsDataUri(
      "https://cdn.example/a.png",
      deps(fetchImpl)
    );
    expect(uri).toContain("base64");
    expect(targets).toEqual([
      "https://cdn.example/a.png",
      "https://cdn2.example/b.png"
    ]);
  });

  it("refuses a redirect hop that lands on a private address", async () => {
    // Hop-by-hop re-validation is the point: a public host must not be
    // able to bounce the fetch into the network interior.
    const fetched: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      fetched.push(String(input));
      return new Response(null, {
        status: 302,
        headers: { location: "https://169.254.169.254/latest/meta-data" }
      });
    }) as typeof fetch;
    const uri = await fetchImageAsDataUri(
      "https://cdn.example/a.png",
      deps(fetchImpl)
    );
    expect(uri).toBeNull();
    // Only the public first hop was fetched; the private target never was.
    expect(fetched).toEqual(["https://cdn.example/a.png"]);
  });

  it("caches successes per URL", async () => {
    const calls: string[] = [];
    const d = deps(pngFetch(calls));
    await fetchImageAsDataUri("https://cdn.example/a.png", d);
    await fetchImageAsDataUri("https://cdn.example/a.png", d);
    expect(calls).toHaveLength(1);
  });
});

describe("inlineImagesInHtml", () => {
  it("rewrites img src to data URIs and dedupes per render", async () => {
    const calls: string[] = [];
    const html =
      '<td><img class="wg-img wg-img-avatar" src="https://cdn.example/a.png" alt="avatar"></td>' +
      '<td><img class="wg-img wg-img-avatar" src="https://cdn.example/a.png" alt="avatar"></td>';
    const out = await inlineImagesInHtml(html, deps(pngFetch(calls)));
    expect(calls).toHaveLength(1);
    expect(out).not.toContain("https://cdn.example/a.png");
    expect(out.match(/data:image\/png;base64,/g)).toHaveLength(2);
    expect(out).toContain('alt="avatar"'); // rest of the tag untouched
  });

  it("inlines up to 24 images, first-N in document order, rest untouched", async () => {
    const calls: string[] = [];
    const html = Array.from(
      { length: 30 },
      (_, i) => `<img src="https://cdn.example/${i}.png" alt="a${i}">`
    ).join("");
    const out = await inlineImagesInHtml(html, deps(pngFetch(calls)));
    expect(calls).toHaveLength(24);
    // a 10-avatar contact table sits well inside the cap
    for (let i = 0; i < 24; i++) {
      expect(out).not.toContain(`https://cdn.example/${i}.png`);
    }
    for (let i = 24; i < 30; i++) {
      expect(out).toContain(`https://cdn.example/${i}.png`);
    }
  });

  it("unescapes serializer-escaped URLs before fetching", async () => {
    const calls: string[] = [];
    const html = '<img src="https://cdn.example/a.png?w=64&amp;h=64" alt="x">';
    const out = await inlineImagesInHtml(html, deps(pngFetch(calls)));
    expect(calls).toEqual(["https://cdn.example/a.png?w=64&h=64"]);
    expect(out).toContain("data:image/png;base64,");
  });

  it("leaves failed sources untouched and data URIs alone", async () => {
    const failFetch = (async () => {
      throw new Error("net down");
    }) as typeof fetch;
    const html =
      '<img src="https://cdn.example/a.png" alt="a">' +
      '<img src="data:image/png;base64,AAAA" alt="b">';
    const out = await inlineImagesInHtml(html, deps(failFetch));
    expect(out).toBe(html);
  });
});

describe("inlineRenderResultImages", () => {
  const APP_MIME = "text/html;profile=mcp-app";

  it("rewrites structuredContent and app resources, not text blocks", async () => {
    const url = "https://cdn.example/a.png";
    const img = `<img class="wg-img wg-img-avatar" src="${url}" alt="avatar">`;
    const result = {
      content: [
        { type: "text", text: `<table>${img}</table>` },
        { type: "resource", resource: { uri: "ui://widgentic/page/table", mimeType: APP_MIME, text: `<!doctype html><body>${img}</body>` } },
        { type: "resource", resource: { uri: "widgentic://widget", mimeType: "application/json", text: "{}" } }
      ],
      structuredContent: { html: img, css: "", payload: {} } as Record<string, unknown>
    };
    await inlineRenderResultImages(result, deps(pngFetch()));

    expect(result.structuredContent.html).toContain("data:image/png;base64,");
    const appResource = (result.content[1] as { resource: { text: string } }).resource;
    expect(appResource.text).toContain("data:image/png;base64,");
    // Model-facing text block and non-app resources keep the original URL.
    expect((result.content[0] as { text: string }).text).toContain(url);
    expect((result.content[2] as { resource: { text: string } }).resource.text).toBe("{}");
  });

  it("rewrites the tree in lockstep with the html surfaces", async () => {
    const url = "https://cdn.example/a.png";
    const calls: string[] = [];
    const result = {
      content: [],
      structuredContent: {
        html: `<td><img class="wg-img wg-img-avatar" src="${url}" alt="avatar"></td>`,
        tree: {
          tag: "td",
          children: [
            {
              tag: "img",
              attrs: { class: "wg-img wg-img-avatar", src: url, alt: "avatar" }
            }
          ]
        },
        payload: {}
      } as Record<string, unknown>
    };
    await inlineRenderResultImages(result, deps(pngFetch(calls)));
    expect(calls).toHaveLength(1); // one fetch feeds both projections
    const tree = result.structuredContent.tree as {
      children: { attrs: { src: string } }[];
    };
    expect(tree.children[0]?.attrs.src).toContain("data:image/png;base64,");
    expect(result.structuredContent.html).toContain("data:image/png;base64,");
    expect(result.structuredContent.html).not.toContain(url);
  });

  it("walks tree-only image sources (none in html)", async () => {
    const result = {
      content: [],
      structuredContent: {
        html: "<div></div>",
        tree: {
          tag: "img",
          attrs: { src: "https://cdn.example/only-in-tree.png" }
        },
        payload: {}
      } as Record<string, unknown>
    };
    await inlineRenderResultImages(result, deps(pngFetch()));
    const tree = result.structuredContent.tree as { attrs: { src: string } };
    expect(tree.attrs.src).toContain("data:image/png;base64,");
  });

  it("does nothing on error results", async () => {
    const calls: string[] = [];
    const result = {
      isError: true,
      content: [{ type: "text", text: '<img src="https://cdn.example/a.png">' }],
      structuredContent: { html: '<img src="https://cdn.example/a.png">' } as Record<string, unknown>
    };
    await inlineRenderResultImages(result, deps(pngFetch(calls)));
    expect(calls).toHaveLength(0);
    expect(result.structuredContent.html).toContain("https://cdn.example/a.png");
  });
});

describe("DNS-rebinding pinning", () => {
  it("hands the transport the exact validated address per hop", async () => {
    const targets: { url: string; address: string | undefined }[] = [];
    const transport = (async (url: string, init: { address?: string }) => {
      targets.push({ url, address: init.address });
      return new Response(PNG_BYTES, {
        status: 200,
        headers: { "content-type": "image/png" }
      });
    }) as unknown as typeof fetch;
    // validation resolves to a public address; a REBINDING resolver would
    // answer privately on the next query — but the transport never asks.
    const out = await fetchImageAsDataUri("https://cdn.example/a.png", {
      fetchImpl: transport,
      lookupImpl: async () => ["93.184.216.34"]
    });
    expect(out).toContain("data:image/png");
    expect(targets).toEqual([
      { url: "https://cdn.example/a.png", address: "93.184.216.34" }
    ]);
  });

  it("re-pins on every redirect hop with that hop's validated address", async () => {
    const targets: string[] = [];
    let call = 0;
    const transport = (async (url: string, init: { address?: string }) => {
      targets.push(`${url} -> ${init.address}`);
      call++;
      if (call === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://mirror.example/b.png" }
        });
      }
      return new Response(PNG_BYTES, {
        status: 200,
        headers: { "content-type": "image/png" }
      });
    }) as unknown as typeof fetch;
    const lookups: string[] = [];
    const out = await fetchImageAsDataUri("https://cdn.example/a.png", {
      fetchImpl: transport,
      lookupImpl: async (host) => {
        lookups.push(host);
        return host === "cdn.example" ? ["93.184.216.34"] : ["203.0.113.7"];
      }
    });
    expect(out).toContain("data:image/png");
    expect(lookups).toEqual(["cdn.example", "mirror.example"]);
    expect(targets).toEqual([
      "https://cdn.example/a.png -> 93.184.216.34",
      "https://mirror.example/b.png -> 203.0.113.7"
    ]);
  });

  it("a privately-resolving hop never reaches the transport at all", async () => {
    const targets: string[] = [];
    const transport = (async (url: string) => {
      targets.push(url);
      return new Response(null, {
        status: 302,
        headers: { location: "https://internal.example/x.png" }
      });
    }) as unknown as typeof fetch;
    const out = await fetchImageAsDataUri("https://cdn.example/a.png", {
      fetchImpl: transport,
      lookupImpl: async (host) =>
        host === "cdn.example" ? ["93.184.216.34"] : ["169.254.169.254"]
    });
    expect(out).toBeNull();
    // only the first (validated) hop was ever contacted
    expect(targets).toEqual(["https://cdn.example/a.png"]);
  });
});

describe("declared resource domains skip inlining", () => {
  it("a declared host stays a URL while an undeclared one inlines", async () => {
    const calls: string[] = [];
    const html =
      '<img src="https://cdn.example/keep.png" alt="k">' +
      '<img src="https://other.example/inline.png" alt="i">';
    const out = await inlineImagesInHtml(html, {
      ...deps(pngFetch(calls)),
      skipHosts: new Set(["cdn.example"])
    });
    expect(calls).toEqual(["https://other.example/inline.png"]);
    expect(out).toContain("https://cdn.example/keep.png");
    expect(out).not.toContain("https://other.example/inline.png");
    expect(out).toContain("data:image/png;base64,");
  });

  it("the result-level pass honors the skip across html and tree", async () => {
    const calls: string[] = [];
    const result = {
      structuredContent: {
        html: '<img src="https://cdn.example/keep.png" alt="k"><img src="https://other.example/i.png" alt="i">',
        tree: {
          tag: "div",
          children: [
            { tag: "img", attrs: { src: "https://cdn.example/keep.png" } },
            { tag: "img", attrs: { src: "https://other.example/i.png" } }
          ]
        }
      } as Record<string, unknown>,
      content: []
    };
    await inlineRenderResultImages(result, {
      ...deps(pngFetch(calls)),
      skipHosts: new Set(["cdn.example"])
    });
    expect(calls).toEqual(["https://other.example/i.png"]);
    const html = String(result.structuredContent.html);
    expect(html).toContain("https://cdn.example/keep.png");
    expect(html).toContain("data:image/png;base64,");
  });
});
