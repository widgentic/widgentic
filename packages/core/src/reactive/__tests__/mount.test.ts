// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mountWidget } from "../index.js";
import { createCatalog, el } from "../../catalog/index.js";

function container(): Element {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("mountWidget surface", () => {
  it("renders the initial payload", () => {
    const target = container();
    const mount = mountWidget(
      { kind: "card", data: { title: "T" } },
      target
    );
    expect(mount.initial).toEqual({ ok: true });
    expect(target.querySelector(".wg-card")).not.toBeNull();
    expect(target.querySelector(".wg-card-title")?.textContent).toBe("T");
  });

  it("keeps the handle usable after an invalid initial payload", () => {
    const target = container();
    const mount = mountWidget({ data: 1 }, target);
    expect(mount.initial.ok).toBe(false);
    if (!mount.initial.ok) {
      expect(mount.initial.error.code).toBe("MISSING_FIELD");
    }
    expect(target.childNodes).toHaveLength(0);
    expect(mount.node()).toBeUndefined();

    const result = mount.update({ kind: "card", data: { a: 1 } });
    expect(result).toEqual({ ok: true });
    expect(target.querySelector(".wg-card")).not.toBeNull();
  });

  it("uses the provided catalog for rendering and validation", () => {
    const target = container();
    const catalog = createCatalog();
    catalog.register("badge", (payload) =>
      el("span", { class: "badge" }, [String(payload.data)])
    );
    const mount = mountWidget(
      { kind: "badge", data: "hi" },
      target,
      { catalog }
    );
    expect(mount.initial).toEqual({ ok: true });
    expect(target.querySelector("span.badge")?.textContent).toBe("hi");
  });
});

describe("failed updates", () => {
  it("leaves the DOM untouched on invalid payload and recovers", () => {
    const target = container();
    const mount = mountWidget(
      { kind: "card", data: { title: "T" } },
      target
    );
    const before = target.innerHTML;
    const beforeNode = mount.node();

    const invalid = mount.update({ data: 1 });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe("MISSING_FIELD");
    expect(target.innerHTML).toBe(before);
    expect(mount.node()).toBe(beforeNode);

    const unknown = mount.update({ kind: "nope", data: 1 });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("UNKNOWN_KIND");
    expect(target.innerHTML).toBe(before);

    const recovered = mount.update({ kind: "card", data: { title: "T2" } });
    expect(recovered).toEqual({ ok: true });
    expect(target.querySelector(".wg-card-title")?.textContent).toBe("T2");
  });
});

describe("lifecycle", () => {
  it("node() reflects the latest successful render", () => {
    const target = container();
    const mount = mountWidget({ kind: "card", data: 1 }, target);
    const first = mount.node();
    expect(first).toBeDefined();
    mount.update({ kind: "card", data: 2 });
    expect(mount.node()).not.toBe(first);
    expect(mount.node()).toBeDefined();
  });

  it("dispose empties the container and is idempotent", () => {
    const target = container();
    const mount = mountWidget({ kind: "card", data: { a: 1 } }, target);
    expect(target.childNodes.length).toBeGreaterThan(0);
    mount.dispose();
    expect(target.childNodes).toHaveLength(0);
    expect(mount.node()).toBeUndefined();
    expect(() => mount.dispose()).not.toThrow();
  });

  it("update after dispose throws", () => {
    const target = container();
    const mount = mountWidget({ kind: "card", data: { a: 1 } }, target);
    mount.dispose();
    expect(() => mount.update({ kind: "card", data: { a: 2 } })).toThrow(
      /disposed/
    );
  });
});

describe("in-place patching preserves what a visitor changed", () => {
  const data = { label: "root", children: [{ label: "leaf", children: [] }] };

  function branchOf(target: Element): HTMLDetailsElement {
    const branch = target.querySelector("details.wg-tree-branch");
    if (!(branch instanceof HTMLDetailsElement)) {
      throw new Error("tree rendered no branch");
    }
    return branch;
  }

  it("keeps a branch the visitor expanded when the same tree re-renders", () => {
    const target = container();
    const payload = { kind: "tree", data, hints: { expandDepth: 0 } };
    const mount = mountWidget(payload, target);
    const branch = branchOf(target);
    expect(branch.open).toBe(false);

    branch.open = true; // the visitor opens it

    expect(mount.update(payload)).toEqual({ ok: true });
    // Same element, still open: the initial state is a pure function of
    // data + hints, so the prev-vs-next diff wrote nothing here.
    expect(branchOf(target)).toBe(branch);
    expect(branch.open).toBe(true);
  });

  it("keeps a branch the visitor collapsed when the same tree re-renders", () => {
    const target = container();
    const payload = { kind: "tree", data };
    const mount = mountWidget(payload, target);
    const branch = branchOf(target);
    expect(branch.open).toBe(true);

    branch.open = false; // the visitor closes it

    expect(mount.update(payload)).toEqual({ ok: true });
    expect(branchOf(target)).toBe(branch);
    expect(branch.open).toBe(false);
  });

  it("mounts a newly appended branch with its computed initial state", () => {
    const target = container();
    const mount = mountWidget(
      { kind: "tree", data: [data], hints: { expandDepth: 0 } },
      target
    );
    branchOf(target).open = true;

    expect(
      mount.update({
        kind: "tree",
        data: [data, { label: "second", children: [{ label: "kid", children: [] }] }],
        hints: { expandDepth: 0 }
      })
    ).toEqual({ ok: true });

    const branches = target.querySelectorAll("details.wg-tree-branch");
    expect(branches).toHaveLength(2);
    expect((branches[0] as HTMLDetailsElement).open).toBe(true); // visitor's
    expect((branches[1] as HTMLDetailsElement).open).toBe(false); // computed
  });
});
