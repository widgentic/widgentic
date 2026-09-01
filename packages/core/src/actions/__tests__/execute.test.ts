import { describe, it, expect } from "vitest";
import { applyOutput, buildRequest, getAtPath, setAtPath, validateArgs } from "../index.js";
import type { HttpActionDefinition } from "../index.js";

const weather: HttpActionDefinition = {
  kind: "http",
  method: "GET",
  url: "https://api.example.com/weather",
  input: { type: "object", properties: { city: { type: "string" }, days: { type: "number" } }, required: ["city"] },
  output: { type: "object", properties: { temp: { type: "number" } }, required: ["temp"] }
};
const noSecrets = () => undefined;

describe("validateArgs", () => {
  it("accepts schema-valid arguments and reports violations with paths", () => {
    expect(validateArgs(weather, { city: "Oslo" })).toBeUndefined();
    expect(validateArgs(weather, {})).toEqual({ code: "INVALID_ACTION_INPUT", message: expect.any(String), path: "args.city" });
    expect(validateArgs(weather, { city: 5 })?.path).toBe("args.city");
  });
});

describe("buildRequest", () => {
  it("GET serializes arguments as query parameters", () => {
    const built = buildRequest(weather, { city: "Vancouver", days: 3, flag: true, obj: { a: 1 }, skip: undefined }, noSecrets);
    expect(built).toMatchObject({ method: "GET", headers: {}, secretValues: [] });
    expect("url" in built && built.url).toBe("https://api.example.com/weather?city=Vancouver&days=3&flag=true&obj=%7B%22a%22%3A1%7D");
    expect("body" in built).toBe(false);
  });

  it("POST sends a JSON body with a content type, fixed query and headers included", () => {
    const post: HttpActionDefinition = { ...weather, method: "POST", query: { units: "metric" }, headers: { Accept: "application/json" } };
    const built = buildRequest(post, { city: "Vancouver" }, noSecrets);
    expect(built).toEqual({
      url: "https://api.example.com/weather?units=metric",
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: '{"city":"Vancouver"}',
      secretValues: []
    });
  });

  it("resolves secret references and records the values for redaction", () => {
    const secured: HttpActionDefinition = { ...weather, headers: { Authorization: { secret: "weather-token" } }, query: { key: { secret: "weather-token" } } };
    const built = buildRequest(secured, { city: "Oslo" }, (name) => (name === "weather-token" ? "sk-live-123" : undefined));
    expect(built).toMatchObject({ headers: { Authorization: "sk-live-123" }, secretValues: ["sk-live-123", "sk-live-123"] });
    expect("url" in built && built.url).toContain("key=sk-live-123");
    const missing = buildRequest({ ...weather, headers: { X: { secret: "nope" } } }, { city: "Oslo" }, noSecrets);
    expect(missing).toEqual({ code: "UNKNOWN_SECRET", message: "Unknown secret 'nope'.", path: "headers.X" });
  });
});

describe("applyOutput", () => {
  const data = { city: "Vancouver", temp: 12, forecast: { today: { high: 1 } } };

  it("merge is the default and keeps fields the response did not return", () => {
    const result = applyOutput(weather, undefined, data, { temp: 18, asOf: "now" });
    expect(result).toEqual({ ok: true, data: { city: "Vancouver", temp: 18, asOf: "now", forecast: { today: { high: 1 } } } });
  });

  it("replace and patch behave as declared", () => {
    expect(applyOutput(weather, { mode: "replace" }, data, { temp: 1 })).toEqual({ ok: true, data: { temp: 1 } });
    const patched = applyOutput(weather, { mode: "patch", path: "forecast.today" }, data, { temp: 20 });
    expect(patched).toEqual({ ok: true, data: { city: "Vancouver", temp: 12, forecast: { today: { temp: 20 } } } });
    expect(data.forecast.today).toEqual({ high: 1 });
  });

  it("map projects the response before the mode applies", () => {
    const result = applyOutput(weather, { map: { "current.celsius": "temp" } }, data, { temp: 7 });
    expect(result).toEqual({ ok: true, data: { ...data, current: { celsius: 7 } } });
  });

  it("a '.' map target takes the source value whole, and patch writes it at the path", () => {
    const schema: HttpActionDefinition = { ...weather, output: { type: "object" } };
    const result = applyOutput(schema, { mode: "patch", path: "reading", map: { ".": "current_weather" } }, data, { current_weather: { temperature: 7 }, other: 1 });
    expect(result).toEqual({ ok: true, data: { ...data, reading: { temperature: 7 } } });
  });

  it("a response that violates the output schema is refused", () => {
    const result = applyOutput(weather, undefined, data, { temp: "warm" });
    expect(result).toEqual({ ok: false, error: { code: "INVALID_ACTION_OUTPUT", message: expect.any(String), path: "response.temp" } });
  });
});

describe("hardening: argument policy and path safety", () => {
  const withFixed: HttpActionDefinition = { ...weather, query: { key: { secret: "k" }, units: "metric" } };
  const data = { city: "Vancouver", temp: 12 };

  it("refuses undeclared and colliding arguments before any request", () => {
    expect(validateArgs(withFixed, { city: "Oslo", extra: 1 })).toMatchObject({ code: "INVALID_ACTION_INPUT", path: "args.extra" });
    expect(validateArgs(withFixed, { city: "Oslo", key: "ATTACKER" })).toMatchObject({ code: "INVALID_ACTION_INPUT", path: "args.key" });
    expect(validateArgs({ ...weather, input: { type: "object" } }, { city: "Oslo" })?.path).toBe("args.city");
    expect(validateArgs(withFixed, "nope")?.path).toBe("args");
    expect(validateArgs(withFixed, { city: "Oslo" })).toBeUndefined();
  });

  it("the author's fixed values are written last and always win", () => {
    const built = buildRequest(withFixed, { city: "Oslo", key: "ATTACKER" }, () => "SECRET") as { url: string };
    const params = new URL(built.url).searchParams;
    expect(params.get("key")).toBe("SECRET");
    expect(params.get("units")).toBe("metric");
    expect(params.get("city")).toBe("Oslo");
  });

  it("paths read own properties only and write into arrays by index only", () => {
    const rows = { rows: [{ id: 1 }, { id: 2 }] };
    expect(getAtPath(rows, "rows.1.id")).toBe(2);
    expect(getAtPath(rows, "rows.foo")).toBeUndefined();
    expect(getAtPath({}, "constructor")).toBeUndefined();
    expect(setAtPath(rows, "rows.0.id", 9)).toEqual({ rows: [{ id: 9 }, { id: 2 }] });
    expect(setAtPath(rows, "rows.foo", 9)).toBe(rows); // refused: no property invented on an array
    const written = setAtPath({}, "__proto__.polluted", true) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(written, "__proto__")).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("merge needs objects on both sides", () => {
    const result = applyOutput({ ...weather, output: { type: "array" } }, undefined, data, [1, 2]);
    expect(result).toEqual({ ok: false, error: { code: "INVALID_ACTION_OUTPUT", message: expect.stringContaining("merge needs an object"), path: "response" } });
    expect(applyOutput({ ...weather, output: { type: "array" } }, { mode: "replace" }, data, [1, 2])).toEqual({ ok: true, data: [1, 2] });
  });
});

describe("applyOutput over an array response", () => {
  /** The currency ticker that motivated per-item projection. */
  const ticker: HttpActionDefinition = {
    kind: "http",
    method: "GET",
    url: "https://api.example.com/ticker",
    input: { type: "object", properties: {} },
    output: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ask: { type: "string" },
          bid: { type: "string" },
          book: { type: "string" },
          date: { type: "string" }
        }
      }
    }
  };
  const response = [
    { ask: "3206.99", bid: "3179.43", book: "usdc_cop", date: "2026-09-01T02:04:47" },
    { ask: "4100.00", bid: "4090.00", book: "usdt_cop", date: "2026-09-01T02:05:00" }
  ];

  it("projects each item and drops unmapped fields", () => {
    const result = applyOutput(ticker, { mode: "replace", map: { ask: "ask", when: "date" } }, {}, response);
    expect(result).toEqual({
      ok: true,
      data: [
        { ask: "3206.99", when: "2026-09-01T02:04:47" },
        { ask: "4100.00", when: "2026-09-01T02:05:00" }
      ]
    });
  });

  it("renames into nested item targets", () => {
    const result = applyOutput(ticker, { mode: "replace", map: { "price.ask": "ask" } }, {}, response);
    expect(result).toEqual({
      ok: true,
      data: [{ price: { ask: "3206.99" } }, { price: { ask: "4100.00" } }]
    });
  });

  it("a source absent from an item projects undefined, as it would for an object", () => {
    const result = applyOutput(ticker, { mode: "replace", map: { ask: "ask", nope: "missing" } }, {}, [response[0]]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const [item] = result.data as Record<string, unknown>[];
      expect(item).toHaveProperty("nope", undefined);
      expect(item?.ask).toBe("3206.99");
    }
  });

  it("an empty array response projects an empty array", () => {
    expect(applyOutput(ticker, { mode: "replace", map: { ask: "ask" } }, {}, [])).toEqual({
      ok: true,
      data: []
    });
  });

  it("the '.' target keeps addressing the response root by index", () => {
    expect(applyOutput(ticker, { mode: "replace", map: { ".": "0" } }, {}, response)).toEqual({
      ok: true,
      data: response[0]
    });
  });

  it("an enveloped list projects per item after the \".\" selection", () => {
    const enveloped: HttpActionDefinition = {
      ...ticker,
      output: {
        type: "object",
        properties: {
          data: ticker.output,
          next: { type: "string" }
        }
      }
    };
    const envelope = { data: [{ ask: "3206.99", bid: "3179.43" }, { ask: "4100.00", bid: "4090.00" }], next: "cursor" };
    expect(applyOutput(enveloped, { mode: "replace", map: { ".": "data", price: "ask" } }, {}, envelope)).toEqual({
      ok: true,
      data: [{ price: "3206.99" }, { price: "4100.00" }]
    });
    // a "." selection of an OBJECT maps that object at its root
    expect(applyOutput(enveloped, { mode: "replace", map: { ".": "data.0", price: "ask" } }, {}, envelope)).toEqual({
      ok: true,
      data: { price: "3206.99" }
    });
  });

  it("index-addressed sources keep the response root — a positional pick still works", () => {
    const response = [{ ask: "3206.99" }, { ask: "3179.43" }];
    expect(applyOutput(ticker, { mode: "merge", map: { latest: "0.ask" } }, { city: "c" }, response)).toEqual({
      ok: true,
      data: { city: "c", latest: "3206.99" }
    });
    expect(applyOutput(ticker, { mode: "replace", map: { first: "0.ask", second: "1.ask" } }, {}, response)).toEqual({
      ok: true,
      data: { first: "3206.99", second: "3179.43" }
    });
  });

  it("an object response still projects at the root", () => {
    const result = applyOutput(weather, { mode: "replace", map: { "current.celsius": "temp" } }, {}, { temp: 7 });
    expect(result).toEqual({ ok: true, data: { current: { celsius: 7 } } });
  });

  it("merge still refuses a projected array", () => {
    const result = applyOutput(ticker, { mode: "merge", map: { ask: "ask" } }, { a: 1 }, response);
    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_ACTION_OUTPUT", message: expect.stringContaining("merge needs an object"), path: "response" }
    });
  });

  it("patch writes the projected array at its path", () => {
    const result = applyOutput(ticker, { mode: "patch", path: "rates", map: { ask: "ask" } }, { city: "Bogota" }, [response[0]]);
    expect(result).toEqual({ ok: true, data: { city: "Bogota", rates: [{ ask: "3206.99" }] } });
  });

  it("the response is still schema-checked before any projection", () => {
    const result = applyOutput(ticker, { mode: "replace", map: { ask: "ask" } }, {}, { ask: "3206.99" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_ACTION_OUTPUT");
  });
});
