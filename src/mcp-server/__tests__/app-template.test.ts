// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { buildAppTemplate } from "../index.js";
import { customWidgets } from "../../../examples/mcp-server/widgets/index.js";
import { createCatalog, renderToHtml } from "../../catalog/index.js";
import type { WidgetNode } from "../../catalog/index.js";
import { registerTemplate } from "../../templates/index.js";

/**
 * Drive the template's inline bridge the way a host does: execute the
 * script against this test's document with a faked parent window, then
 * dispatch JSON-RPC messages into its listener.
 */
function bootTemplate() {
  document.head.innerHTML = '<style id="wg-dynamic-css"></style>';
  document.body.innerHTML = '<div id="wg-root"></div>';
  const template = buildAppTemplate();
  const script = template.split("<script>")[1]?.split("</script>")[0];
  if (script === undefined) throw new Error("template has no inline script");

  const sent: Record<string, unknown>[] = [];
  const listeners: ((event: { data: unknown }) => void)[] = [];
  const fakeWindow = {
    parent: { postMessage: (m: Record<string, unknown>) => sent.push(m) },
    addEventListener: (_type: string, fn: (event: { data: unknown }) => void) =>
      listeners.push(fn),
    innerWidth: 800
  };
  class ObserverStub {
    observe(): void {}
  }
  new Function("window", "document", "ResizeObserver", script)(
    fakeWindow,
    document,
    ObserverStub
  );
  return {
    sent,
    dispatch: (data: unknown) => listeners.forEach((fn) => fn({ data })),
    root: () => document.getElementById("wg-root") as HTMLElement
  };
}

function toolResult(structuredContent: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    method: "ui/notifications/tool-result",
    params: { structuredContent }
  };
}

const catalog = createCatalog();
for (const widget of customWidgets) {
  registerTemplate(catalog, widget.kind, widget.template, widget.descriptor);
}

function treeOf(payload: Record<string, unknown>): WidgetNode {
  const rendered = catalog.render(payload);
  if (!rendered.ok) throw new Error("fixture payload failed to render");
  return rendered.node;
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("app template native mounting", () => {
  it("native mount matches renderToHtml across the kind matrix", () => {
    const payloads: Record<string, unknown>[] = [
      { kind: "card", data: { title: "T", fields: { price: 9.99, photo: "https://cdn.example/p.jpg" } } },
      { kind: "table", data: [{ user: "Ada", avatar: "https://cdn.example/a.png" }] },
      { kind: "tree", data: { label: "root", children: [{ label: "leaf", children: [] }] } },
      { kind: "custom", data: { any: ["shape", 42] } },
      {
        kind: "invoice",
        data: (catalog.describe("invoice")?.dataExample as Record<string, unknown>) ?? {}
      }
    ];
    for (const payload of payloads) {
      const { dispatch, root } = bootTemplate();
      const tree = treeOf(payload);
      dispatch(toolResult({ tree, css: "", html: "<div>fallback-unused</div>" }));
      // DOM-equivalence: renderToHtml escapes more aggressively than the DOM
      // serializer (e.g. quotes in text nodes); canonicalize both through
      // the same parser so the comparison is about structure, not escaping.
      const reference = document.createElement("div");
      reference.innerHTML = renderToHtml(tree);
      expect(root().innerHTML, String(payload.kind)).toBe(reference.innerHTML);
    }
  });

  it("successive results patch the mounted DOM in place", () => {
    const { dispatch, root } = bootTemplate();
    const first = treeOf({ kind: "table", data: [{ a: "one" }] });
    const second = treeOf({ kind: "table", data: [{ a: "two" }] });
    dispatch(toolResult({ tree: first, css: "" }));
    const mounted = root().firstChild;
    expect(mounted).not.toBeNull();
    dispatch(toolResult({ tree: second, css: "" }));
    expect(root().firstChild).toBe(mounted); // same element object, patched
    expect(root().innerHTML).toContain("two");
    expect(root().innerHTML).not.toContain("one");
  });

  it("skips unsafe tags and attributes from a tampered tree", () => {
    const { dispatch, root } = bootTemplate();
    dispatch(
      toolResult({
        tree: {
          tag: "div",
          attrs: { class: "ok", onclick: "alert(1)", "bad name": "x" },
          children: [{ tag: "scr ipt", children: ["nope"] }, "text"]
        },
        css: ""
      })
    );
    const div = root().firstChild as HTMLElement;
    expect(div.getAttribute("class")).toBe("ok");
    expect(div.getAttribute("onclick")).toBeNull();
    expect(div.getAttribute("bad name")).toBeNull();
    expect(div.innerHTML).not.toContain("nope");
    expect(div.textContent).toContain("text");
  });

  it("falls back to html injection when tree is absent", () => {
    const { dispatch, root } = bootTemplate();
    dispatch(toolResult({ html: '<div class="wg-card">legacy</div>', css: "" }));
    expect(root().innerHTML).toBe('<div class="wg-card">legacy</div>');
  });

  it("keeps the error-state behavior for structured-content-less results", () => {
    const { dispatch, root } = bootTemplate();
    dispatch({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        isError: true,
        content: [{ type: "text", text: '{"message":"Unknown widget"}' }]
      }
    });
    expect(root().querySelector(".wg-app-error")?.textContent).toBe("Unknown widget");
  });

  it("builder is a library module importing only widgentic entries", () => {
    // The template ships from the library: no MCP SDK, no deployment code.
    // happy-dom rewrites import.meta.url to an http scheme; vitest runs
    // from the repo root, so resolve from cwd instead.
    const source = readFileSync("src/mcp-server/app-template.ts", "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) {
      expect(specifier, specifier).toMatch(/^\.\.?\//);
      expect(specifier).not.toContain("apps/");
      expect(specifier).not.toContain("examples/");
      expect(specifier).not.toContain("@modelcontextprotocol");
    }
  });

  it("honors host context from initialize and host-context-changed", async () => {
    const { sent, dispatch, root } = bootTemplate();
    // Answer the bridge's ui/initialize with a host context.
    const init = sent.find((m) => m.method === "ui/initialize") as
      | { id?: number }
      | undefined;
    expect(init?.id).toBeDefined();
    dispatch({
      jsonrpc: "2.0",
      id: init?.id,
      result: {
        hostContext: {
          theme: "dark",
          styles: { variables: { "--color-background-primary": "#101318" } },
          safeAreaInsets: { top: 1, right: 2, bottom: 3, left: 4 }
        }
      }
    });
    // The response resolves a promise; applyHostContext runs a microtask later.
    await Promise.resolve();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(
      document.documentElement.style.getPropertyValue("--color-background-primary")
    ).toBe("#101318");
    expect(document.body.style.padding).toBe("1px 2px 3px 4px");

    // Live re-theme: the host flips to light mid-session.
    dispatch({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: {
        theme: "light",
        styles: { variables: { "--color-background-primary": "#ffffff" } }
      }
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(
      document.documentElement.style.getPropertyValue("--color-background-primary")
    ).toBe("#ffffff");

    // An explicit widgentic theme lands in the dynamic style element,
    // which sits after the host token bridge — so it overrides host vars.
    const tree = treeOf({ kind: "card", data: { a: 1 } });
    dispatch(toolResult({ tree, css: ":root { --wg-bg: #123456; }" }));
    expect(document.getElementById("wg-dynamic-css")?.textContent).toContain(
      "--wg-bg: #123456"
    );
    expect(root().firstChild).not.toBeNull();
  });

  it("flips unbridged tokens to the dark preset under data-theme=dark", () => {
    const template = buildAppTemplate();
    const darkBlock = /:root\[data-theme="dark"\] \{([^}]*)\}/.exec(template)?.[1] ?? "";
    // Unbridged colors flip (surface is the one that burned us live)…
    expect(darkBlock).toContain("--wg-surface: #161b26;");
    expect(darkBlock).toContain("--wg-danger:");
    // …while host-bridged tokens stay host-exact in both modes.
    expect(darkBlock).not.toContain("--wg-bg:");
    expect(darkBlock).not.toContain("--wg-fg:");
    expect(darkBlock).not.toContain("--wg-accent:");
  });

  it("references no external origins anywhere in the template", () => {
    // The Apps sandbox forbids external fetches; the template must be
    // self-contained (host CSS custom properties only, literal fallbacks).
    expect(buildAppTemplate()).not.toMatch(/https?:\/\//);
  });

  it("remounts cleanly after a tool-input placeholder", () => {
    const { dispatch, root } = bootTemplate();
    const tree = treeOf({ kind: "card", data: { a: 1 } });
    dispatch(toolResult({ tree, css: "" }));
    dispatch({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-input",
      params: { arguments: { widget: "card" } }
    });
    expect(root().textContent).toContain("Rendering");
    dispatch(toolResult({ tree, css: "" }));
    expect(root().innerHTML).toBe(renderToHtml(tree));
  });
});

describe("app template link handling", () => {
  const linkTree = {
    tag: "div",
    attrs: { class: "wg-card" },
    children: [
      { tag: "a", attrs: { href: "https://example.org", class: "wg-link" }, children: ["site"] },
      { tag: "a", attrs: { href: "/relative" }, children: ["rel"] }
    ]
  };

  it("clicks never navigate the frame — the host opens the URL", () => {
    const { sent, dispatch, root } = bootTemplate();
    dispatch(toolResult({ tree: linkTree }));
    const anchor = root().querySelector('a[href="https://example.org"]') as HTMLElement;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    // The frame is the widget: default ALWAYS prevented…
    expect(event.defaultPrevented).toBe(true);
    // …and the host is asked to open the URL.
    const open = sent.find((m) => m.method === "ui/open-link") as
      | { params?: { url?: string }; id?: unknown }
      | undefined;
    expect(open?.params).toEqual({ url: "https://example.org" });
    expect(open?.id).toBeDefined(); // a request, not a notification
  });

  it("non-http(s)/mailto/tel hrefs are prevented without a host request", () => {
    const { sent, dispatch, root } = bootTemplate();
    dispatch(toolResult({ tree: linkTree }));
    const before = sent.filter((m) => m.method === "ui/open-link").length;
    const anchor = root().querySelector('a[href="/relative"]') as HTMLElement;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(sent.filter((m) => m.method === "ui/open-link").length).toBe(before);
  });

  it("a denied open-link leaves the widget rendered", () => {
    const { sent, dispatch, root } = bootTemplate();
    dispatch(toolResult({ tree: linkTree }));
    (root().querySelector('a[href="https://example.org"]') as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    const open = sent.find((m) => m.method === "ui/open-link") as { id: unknown };
    // Host denies: the rejection is swallowed and the widget stays.
    dispatch({ jsonrpc: "2.0", id: open.id, error: { code: -1, message: "blocked" } });
    expect(root().querySelector(".wg-card")).not.toBeNull();
    expect(root().textContent).toContain("site");
  });
});
