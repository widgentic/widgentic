// @vitest-environment happy-dom
/**
 * The bridge links a result's stylesheets before the result CSS and keeps
 * them in step with every later result and preview.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { bootTemplate, settle, tick, toolInputPartial, toolResult } from "./template-harness.js";

const A = { type: "stylesheet", href: "https://fonts.googleapis.com/icon?family=Material+Icons" };
const SRI = "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC";
const B = { type: "stylesheet", href: "https://cdn.example.org/brand.css", integrity: SRI };
const tree = { tag: "div", attrs: { class: "wg-x" }, children: ["hi"] };

const links = () => [...document.head.querySelectorAll('link[rel="stylesheet"]')] as HTMLLinkElement[];
const headOrder = () => [...document.head.children].map((el) => (el.id === "wg-dynamic-css" ? "css" : el.getAttribute("href")));

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("the bridge links a result's stylesheets", () => {
  it("links each before the result CSS, in order, integrity with crossorigin", () => {
    const t = bootTemplate();
    t.dispatch(toolResult({ tree, css: ".wg-x { color: red }", resources: [A, B] }));
    expect(headOrder()).toEqual([A.href, B.href, "css"]);
    const [a, b] = links();
    expect(a?.hasAttribute("integrity")).toBe(false);
    expect(a?.hasAttribute("crossorigin")).toBe(false);
    expect(b?.getAttribute("integrity")).toBe(SRI);
    expect(b?.getAttribute("crossorigin")).toBe("anonymous");
  });

  it("keeps a listed link's element, removes the unlisted, and removes all for a result without any", () => {
    const t = bootTemplate();
    t.dispatch(toolResult({ tree, css: "", resources: [A, B] }));
    const b = links()[1];
    t.dispatch(toolResult({ tree, css: "", resources: [B] }));
    expect(links()).toHaveLength(1);
    expect(links()[0]).toBe(b);
    expect(headOrder()).toEqual([B.href, "css"]);
    t.dispatch(toolResult({ tree, css: "" }));
    expect(links()).toHaveLength(0);
  });

  it("reorders without recreating, and never links the same entry twice", () => {
    const t = bootTemplate();
    t.dispatch(toolResult({ tree, css: "", resources: [A, B] }));
    const [a, b] = links();
    t.dispatch(toolResult({ tree, css: "", resources: [B, A, B] }));
    expect(headOrder()).toEqual([B.href, A.href, "css"]);
    expect(links()[0]).toBe(b);
    expect(links()[1]).toBe(a);
  });

  it("ignores an entry that is not an https stylesheet", () => {
    const t = bootTemplate();
    t.dispatch(
      toolResult({
        tree,
        css: "",
        resources: [
          { type: "script", href: "https://cdn.example.org/x.js" },
          { type: "stylesheet", href: "http://cdn.example.org/a.css" },
          { type: "stylesheet", href: "javascript:alert(1)" },
          "https://cdn.example.org/a.css",
          { type: "stylesheet" }
        ]
      })
    );
    expect(links()).toHaveLength(0);
    expect(document.head.querySelectorAll("script")).toHaveLength(0);
  });

  it("a server preview links them before the result arrives, and the result keeps them", async () => {
    const t = bootTemplate();
    t.initialize({ serverTools: {} });
    await tick();
    t.dispatch(toolInputPartial({ widget: "person", data: { name: "Ada" } }));
    await settle();
    const [call] = t.requests("tools/call");
    t.answer(call?.id ?? -1, {
      result: { content: [], structuredContent: { tree, css: ".wg-x { color: red }", resources: [A] } }
    });
    await tick();
    expect(headOrder()).toEqual([A.href, "css"]);
    const a = links()[0];
    t.dispatch(toolResult({ tree, css: "", resources: [A] }));
    expect(links()[0]).toBe(a);
  });
});
