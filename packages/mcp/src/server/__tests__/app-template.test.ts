// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { buildAppTemplate } from "../index.js";
import { customWidgets } from "@widgentic-examples/mcp-server/widgets";
import { createCatalog, renderToHtml } from "@widgentic/core";
import type { WidgetNode } from "@widgentic/core";
import { registerTemplate } from "@widgentic/core";

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
      { kind: "group", data: { items: [{ kind: "card", data: { title: "A" } }] } },
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
    const source = readFileSync("packages/mcp/src/server/app-template.ts", "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) {
      expect(specifier, specifier).toMatch(/^(?:\.\.?\/|@widgentic\/)/);
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

  it("remounts cleanly across calls on a reused frame", async () => {
    const { dispatch, root } = bootTemplate();
    const tree = treeOf({ kind: "card", data: { a: 1 } });
    dispatch(toolResult({ tree, css: "" }));
    // A new call's input on the SAME frame starts a fresh preview cycle.
    dispatch({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-input",
      params: { arguments: { widget: "card" } }
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(root().getAttribute("data-wgd-preview")).toBe("true");
    dispatch(toolResult({ tree, css: "" }));
    expect(root().getAttribute("data-wgd-preview")).toBeNull();
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

function toolInputPartial(args: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    method: "ui/notifications/tool-input-partial",
    params: { arguments: args }
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("streaming input preview", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("growing table rows patch in place, marked in progress", async () => {
    const t = bootTemplate();
    t.dispatch(toolInputPartial({ widget: "table", data: [{ name: "Ada", role: "eng" }] }));
    await settle();
    expect(t.root().getAttribute("data-wgd-preview")).toBe("true");
    expect(t.root().querySelectorAll(".wg-table-row")).toHaveLength(1);
    const firstRow = t.root().querySelector(".wg-table-row");

    t.dispatch(
      toolInputPartial({
        widget: "table",
        data: [{ name: "Ada", role: "eng" }, { name: "Lin", role: "ops" }]
      })
    );
    await settle();
    expect(t.root().querySelectorAll(".wg-table-row")).toHaveLength(2);
    // in-place patch: the first row keeps its node identity
    expect(t.root().querySelector(".wg-table-row")).toBe(firstRow);
  });

  it("group items appear progressively; custom items get skeletons", async () => {
    const t = bootTemplate();
    t.dispatch(
      toolInputPartial({
        widget: "group",
        data: { items: [{ kind: "card", data: { title: "A" } }] },
        hints: { layout: "grid", columns: 2, gap: "lg" }
      })
    );
    await settle();
    expect(t.root().querySelector(".wg-group.wg-group-grid.wg-gap-lg.wg-cols-2")).toBeTruthy();
    expect(t.root().querySelectorAll(".wg-card")).toHaveLength(1);

    t.dispatch(
      toolInputPartial({
        widget: "group",
        data: {
          items: [
            { kind: "card", data: { title: "A" } },
            { kind: "invoice", data: {} }
          ]
        },
        hints: { layout: "grid", columns: 2, gap: "lg" }
      })
    );
    await settle();
    expect(t.root().querySelectorAll(".wg-card")).toHaveLength(1);
    const skeleton = t.root().querySelector(".wg-preview-skeleton");
    expect(skeleton?.textContent).toContain("invoice");
  });

  it("a custom top-level kind previews as a labeled skeleton", async () => {
    const t = bootTemplate();
    t.dispatch(toolInputPartial({ widget: "x-post", data: { author: {} } }));
    await settle();
    expect(t.root().querySelector(".wg-preview-skeleton")?.textContent).toContain("x-post");
    expect(t.root().getAttribute("data-wgd-preview")).toBe("true");
  });

  it("the result replaces the preview; new input then previews the next call", async () => {
    const t = bootTemplate();
    t.dispatch(toolInputPartial({ widget: "table", data: [{ a: 1 }] }));
    await settle();
    expect(t.root().getAttribute("data-wgd-preview")).toBe("true");

    const payload = { kind: "table", data: [{ a: 1 }, { a: 2 }] };
    const tree = treeOf(payload);
    t.dispatch(toolResult({ tree, html: renderToHtml(tree) }));
    expect(t.root().getAttribute("data-wgd-preview")).toBeNull();
    expect(t.root().querySelectorAll(".wg-table-row")).toHaveLength(2);

    // frame reuse: the NEXT call's partial starts a new preview cycle
    t.dispatch(toolInputPartial({ widget: "card", data: { title: "next" } }));
    await settle();
    expect(t.root().getAttribute("data-wgd-preview")).toBe("true");
    expect(t.root().querySelector(".wg-card-title")?.textContent).toBe("next");
  });

  it("cancellation restores the placeholder and previews can start again", async () => {
    const t = bootTemplate();
    t.dispatch(toolInputPartial({ widget: "card", data: { title: "A" } }));
    await settle();
    t.dispatch({ jsonrpc: "2.0", method: "ui/notifications/tool-cancelled", params: {} });
    expect(t.root().textContent).toBe("");
    expect(t.root().getAttribute("data-wgd-preview")).toBeNull();

    t.dispatch(toolInputPartial({ widget: "card", data: { title: "B" } }));
    await settle();
    expect(t.root().querySelector(".wg-card-title")?.textContent).toBe("B");
  });

  it("string-marshalled data peels once it parses", async () => {
    const t = bootTemplate();
    t.dispatch(
      toolInputPartial({ widget: "table", data: JSON.stringify([{ name: "Ada" }]) })
    );
    await settle();
    expect(t.root().querySelector(".wg-table-cell")?.textContent).toBe("Ada");
  });

  it("hosts sending no input notifications behave exactly as before", () => {
    const t = bootTemplate();
    const payload = { kind: "card", data: { title: "T" } };
    const tree = treeOf(payload);
    t.dispatch(toolResult({ tree, html: renderToHtml(tree) }));
    expect(t.root().getAttribute("data-wgd-preview")).toBeNull();
    expect(t.root().querySelector(".wg-card-title")?.textContent).toBe("T");
  });
});

describe("tree disclosures through the bridge", () => {
  const data = {
    label: "root",
    children: [{ label: "leaf", children: [] }]
  };

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("previews branches as open disclosures", async () => {
    const t = bootTemplate();
    t.dispatch(toolInputPartial({ widget: "tree", data, hints: { expandDepth: 0 } }));
    await settle();

    const branch = t.root().querySelector("details.wg-tree-branch");
    expect(branch).not.toBeNull();
    // Partial input has no meaningful collapse state — expandDepth is
    // deliberately ignored while streaming.
    expect(branch?.hasAttribute("open")).toBe(true);
    expect(branch?.querySelector("summary.wg-tree-label")?.textContent).toBe("root");
  });

  it("previews a node icon as text before the label", async () => {
    const t = bootTemplate();
    t.dispatch(
      toolInputPartial({
        widget: "tree",
        data: { label: "src", icon: "\u{1F4C1}", children: [{ label: "a", children: [] }] }
      })
    );
    await settle();

    const summary = t.root().querySelector("summary.wg-tree-label");
    expect(summary?.querySelector("span.wg-tree-icon")?.textContent).toBe("\u{1F4C1}");
    expect(summary?.textContent).toBe("\u{1F4C1}src");
  });

  it("leaves a visitor's toggle alone when the result re-renders the same tree", () => {
    const payload = { kind: "tree", data, hints: { expandDepth: 0 } };
    const t = bootTemplate();
    t.dispatch(toolResult({ tree: treeOf(payload) }));

    const branch = t.root().querySelector("details.wg-tree-branch");
    if (!(branch instanceof HTMLDetailsElement)) throw new Error("no branch mounted");
    expect(branch.open).toBe(false);

    branch.open = true; // the visitor opens it

    // an action folds its result back and re-renders the same tree
    t.dispatch(toolResult({ tree: treeOf(payload) }));

    const after = t.root().querySelector("details.wg-tree-branch");
    expect(after).toBe(branch); // patched, not rebuilt
    expect(branch.open).toBe(true);
  });

  it("mounts a branch the result newly appends with its computed state", () => {
    const t = bootTemplate();
    t.dispatch(toolResult({ tree: treeOf({ kind: "tree", data: [data], hints: { expandDepth: 0 } }) }));
    const first = t.root().querySelector("details.wg-tree-branch") as HTMLDetailsElement;
    first.open = true;

    t.dispatch(
      toolResult({
        tree: treeOf({
          kind: "tree",
          data: [data, { label: "second", children: [{ label: "kid", children: [] }] }],
          hints: { expandDepth: 0 }
        })
      })
    );

    const branches = t.root().querySelectorAll("details.wg-tree-branch");
    expect(branches).toHaveLength(2);
    expect((branches[0] as HTMLDetailsElement).open).toBe(true); // visitor's
    expect((branches[1] as HTMLDetailsElement).open).toBe(false); // computed
  });
});

describe("preview drift pins against the real renderers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const cases: { name: string; payload: Record<string, unknown> }[] = [
    {
      name: "card",
      payload: {
        kind: "card",
        data: { title: "Essence", subtitle: "beauty", fields: { price: 9.99, stock: 99 } },
        hints: { fieldFormat: { price: "${value}" } }
      }
    },
    {
      name: "table",
      payload: {
        kind: "table",
        data: [{ name: "Ada", role: "eng" }, { name: "Lin", role: "ops" }],
        meta: { title: "People", subtitle: "synthetic" }
      }
    },
    {
      name: "tree",
      payload: {
        kind: "tree",
        data: {
          label: "root",
          icon: "\u{1F4C1}",
          children: [{ label: "leaf", icon: "\u{1F4C4}", children: [] }]
        }
      }
    },
    {
      // A labelless node exercises the fallback exclusion in BOTH renderers.
      name: "tree fallback",
      payload: {
        kind: "tree",
        data: {
          icon: "\u{1F4C1}",
          children: [{ label: "leaf", children: [] }]
        }
      }
    },
    {
      name: "group",
      payload: {
        kind: "group",
        data: {
          items: [
            { kind: "card", data: { title: "A" } },
            { kind: "table", data: [{ n: 1 }] }
          ]
        },
        hints: { layout: "grid", columns: 2, gap: "lg" }
      }
    }
  ];

  for (const testCase of cases) {
    it(`${testCase.name}: same classes and text as the catalog renderer`, async () => {
      const rendered = catalog.render(testCase.payload);
      if (!rendered.ok) throw new Error("drift fixture failed to render");
      const real = document.createElement("div");
      real.innerHTML = renderToHtml(rendered.node);

      const t = bootTemplate();
      t.dispatch(
        toolInputPartial({
          widget: testCase.payload.kind as string,
          data: testCase.payload.data,
          hints: testCase.payload.hints,
          meta: testCase.payload.meta
        })
      );
      await settle();

      // identical visible text…
      expect(t.root().textContent).toBe(real.textContent);
      // …and every structural wg-* class the renderer emits is present
      const realClasses = new Set<string>();
      real.querySelectorAll("[class]").forEach((el) =>
        el.className.split(/\s+/).forEach((cls) => cls && realClasses.add(cls))
      );
      for (const cls of realClasses) {
        expect(
          t.root().querySelector(`.${cls}`),
          `missing preview class ${cls} for ${testCase.name}`
        ).toBeTruthy();
      }
    });
  }
});

describe("the preview's sanctioned divergence from the renderer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("an image-URL icon previews as TEXT while the result renders an img", async () => {
    // Sanctioned and pinned by name: the preview never emits images (the
    // sandbox CSP blocks external sources and inlining runs on the RESULT),
    // so "fixing" the preview to emit <img> would flash broken images.
    const payload = {
      kind: "tree",
      data: { label: "docs", icon: "https://cdn.example/folder.png", children: [{ label: "leaf", children: [] }] }
    };
    const rendered = catalog.render(payload);
    if (!rendered.ok) throw new Error("fixture failed to render");
    const real = document.createElement("div");
    real.innerHTML = renderToHtml(rendered.node);
    expect(real.querySelector("img.wg-img.wg-img-icon")?.getAttribute("alt")).toBe("");

    const t = bootTemplate();
    t.dispatch(toolInputPartial({ widget: "tree", data: payload.data }));
    await settle();
    expect(t.root().querySelector("img")).toBeNull();
    expect(t.root().querySelector(".wg-tree-icon")?.textContent).toBe("https://cdn.example/folder.png");
  });

  it("a deep branch previews as a disclosure with children pending, never as a leaf", async () => {
    // The preview caps RECURSION at 12, not shape: a deeper branch keeps its
    // details markup with an empty children list, so the result patch fills
    // it in place instead of replacing a leaf span with a details subtree.
    let data: Record<string, unknown> = { label: "bottom", children: [] };
    for (let i = 0; i < 14; i++) data = { label: `n${i}`, children: [data] };
    const t = bootTemplate();
    t.dispatch(toolInputPartial({ widget: "tree", data }));
    await settle();
    const branches = t.root().querySelectorAll("details.wg-tree-branch");
    expect(branches.length).toBeGreaterThan(0);
    const deepest = branches[branches.length - 1];
    expect(deepest?.querySelector("ul.wg-tree-children")?.children.length).toBe(0);
    expect(t.root().textContent).not.toContain("bottom");
  });
});
