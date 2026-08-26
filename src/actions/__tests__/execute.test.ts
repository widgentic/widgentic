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
