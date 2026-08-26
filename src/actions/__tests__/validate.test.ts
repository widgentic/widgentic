import { describe, it, expect } from "vitest";
import { validateActionBinding, validateActionDefinition, validateLoadBinding } from "../index.js";

const http = {
  kind: "http",
  method: "GET",
  url: "https://api.example.com/weather",
  input: { type: "object", properties: { city: { type: "string" } } },
  output: { type: "object" }
};

describe("validateActionDefinition", () => {
  it("accepts well-formed prompt and http definitions", () => {
    expect(validateActionDefinition({ kind: "prompt", text: ["Hi ", { bind: "name" }] })).toBeUndefined();
    expect(validateActionDefinition({ ...http, headers: { Authorization: { secret: "weather-token" } }, query: { units: "metric" } })).toBeUndefined();
  });

  it("names the offending field", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ ...http, url: "http://api.example.com" }, "url"],
      [{ ...http, url: "https://user:pw@api.example.com" }, "url"],
      [{ ...http, url: "https://api.example.com/#frag" }, "url"],
      [{ ...http, url: "/relative" }, "url"],
      [{ ...http, method: "DELETE" }, "method"],
      [{ ...http, input: { type: "array" } }, "input"],
      [{ ...http, input: { type: "object", default: { secret: "x" } } }, "input"],
      [{ ...http, output: "nope" }, "output"],
      [{ ...http, headers: { X: { secret: "Not Valid" } } }, "headers.X"],
      [{ ...http, headers: { X: 5 } }, "headers.X"],
      [{ kind: "prompt", text: ["x".repeat(2001)] }, "text"],
      [{ kind: "prompt", text: [{ bind: 3 }] }, "text.0"],
      [{ kind: "sql" }, "kind"]
    ];
    for (const [definition, path] of cases) {
      const error = validateActionDefinition(definition, "");
      expect(error, JSON.stringify(definition)).toBeDefined();
      expect(error?.path).toBe(path);
    }
  });
});

describe("validateActionBinding", () => {
  const resolve = (ref: string) => (ref === "refresh" ? (http as never) : undefined);

  it("checks input keys against a known input schema", () => {
    expect(validateActionBinding({ ref: "refresh", input: { city: "location.city" } }, "b", { resolve })).toBeUndefined();
    expect(validateActionBinding({ ref: "refresh", input: { zip: "z" } }, "b", { resolve })?.path).toBe("b.input.zip");
    expect(validateActionBinding({ ref: "missing" }, "b", { resolve })?.path).toBe("b.ref");
  });

  it("rejects secret references smuggled through constants and prompt input/output", () => {
    expect(validateActionBinding({ ref: "refresh", input: { city: { const: { secret: "t" } } } }, "b", { resolve })?.path).toBe("b.input.city");
    expect(validateActionBinding({ definition: { kind: "prompt", text: ["x"] }, input: { a: "b" } }, "b")?.path).toBe("b.input");
    expect(validateActionBinding({ definition: { kind: "prompt", text: ["x"] }, output: { mode: "merge" } }, "b")?.path).toBe("b.output");
    expect(validateActionBinding({ input: { a: "b" } }, "b")?.path).toBe("b");
  });

  it("load bindings must be http GET", () => {
    expect(validateLoadBinding({ ref: "refresh" }, "load", { resolve })).toBeUndefined();
    expect(validateLoadBinding({ definition: { ...http, method: "POST" } }, "load")?.message).toContain("http GET");
    expect(validateLoadBinding({ definition: { kind: "prompt", text: ["x"] } }, "load")?.message).toContain("http GET");
    // Unresolvable at this layer: accepted, composition decides.
    expect(validateLoadBinding({ ref: "later" }, "load")).toBeUndefined();
  });
});
