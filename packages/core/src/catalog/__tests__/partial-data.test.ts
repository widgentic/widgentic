import { describe, expect, it } from "vitest";
import { createCatalog, renderToHtml } from "../index.js";

function catalogWithPerson() {
  const catalog = createCatalog();
  catalog.register(
    "person",
    (payload) => {
      const data = payload.data as { name?: unknown; email?: unknown };
      return { tag: "div", attrs: { class: "person" }, children: [String(data.name ?? ""), String(data.email ?? "")] };
    },
    {
      description: "A person",
      dataShape: "{ name, email }",
      dataSchema: {
        type: "object",
        required: ["name", "email"],
        properties: { name: { type: "string" }, email: { type: "string" } }
      }
    }
  );
  return catalog;
}

describe("partial-data renders", () => {
  it("renders incomplete data that the schema would refuse", () => {
    const catalog = catalogWithPerson();
    const payload = { kind: "person", data: { name: "Ada" } };
    const partial = catalog.render(payload, { partialData: true });
    expect(partial.ok).toBe(true);
    if (partial.ok) expect(renderToHtml(partial.node)).toContain("Ada");
    expect(catalog.render(payload).ok).toBe(false);
  });

  it("passes the option to group items", () => {
    const catalog = catalogWithPerson();
    const group = { kind: "group", data: { items: [{ kind: "person", data: { name: "Ada" } }] } };
    const partial = catalog.render(group, { partialData: true });
    expect(partial.ok).toBe(true);
    if (partial.ok) expect(renderToHtml(partial.node)).toContain("Ada");
    const strict = catalog.render(group);
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.error.path?.startsWith("data.items[0]")).toBe(true);
  });

  it("still applies the payload contract", () => {
    const result = createCatalog().render({ data: 1 }, { partialData: true });
    expect(result).toMatchObject({ ok: false, error: { code: "MISSING_FIELD" } });
  });

  it("renders exactly as before when the option is false", () => {
    const catalog = catalogWithPerson();
    const complete = { kind: "person", data: { name: "Ada", email: "ada@example.org" } };
    const plain = catalog.render(complete);
    const explicit = catalog.render(complete, { partialData: false });
    expect(explicit).toEqual(plain);
  });
});
