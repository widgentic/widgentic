// @vitest-environment node
import { describe, expect, it } from "vitest";
import { guardedJsonFetch, isPrivateAddress } from "../index.js";
import type { BuiltRequest } from "@widgentic/core";

describe("isPrivateAddress (BlockList)", () => {
  it("catches IPv6 forms that embed a private IPv4 address", () => {
    for (const addr of ["::ffff:7f00:1", "[::ffff:7f00:1]", "::ffff:127.0.0.1", "::7f00:1", "64:ff9b::7f00:1", "2002:7f00:1::", "2002:a00:1::", "ff02::1", "0:0:0:0:0:0:0:1", "::", "fe80::1", "fc00::1", "FD00::1"]) {
      expect(isPrivateAddress(addr), addr).toBe(true);
    }
  });

  it("keeps public addresses public and unparsable input unsafe", () => {
    for (const addr of ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946", "::ffff:5db8:d822", "2002:5db8:d822::"]) {
      expect(isPrivateAddress(addr), addr).toBe(false);
    }
    for (const addr of ["192.0.0.9", "198.18.0.1", "100.64.0.1", "169.254.169.254", "0.0.0.0", "not-an-ip", "1.2.3"]) {
      expect(isPrivateAddress(addr), addr).toBe(true);
    }
  });
});

const built = (overrides: Partial<BuiltRequest> = {}): BuiltRequest => ({
  url: "https://api.example.com/w",
  method: "GET",
  headers: {},
  secretValues: [],
  ...overrides
});
const lookupImpl = async () => ["93.184.216.34"];

describe("guardedJsonFetch policy", () => {
  it("accepts 204/empty bodies as null and +json media types", async () => {
    const empty = await guardedJsonFetch(built(), { lookupImpl, fetchImpl: async () => new Response(null, { status: 204 }) });
    expect(empty).toEqual({ ok: true, status: 204, body: null });
    const problem = await guardedJsonFetch(built(), { lookupImpl, fetchImpl: async () => new Response('{"a":1}', { status: 200, headers: { "content-type": "application/problem+json; charset=utf-8" } }) });
    expect(problem).toEqual({ ok: true, status: 200, body: { a: 1 } });
  });

  it("checks the content type before reading the body", async () => {
    // A body that fails on read: if the type were checked after reading,
    // the reason would be the read failure, not the media type.
    const stream = new ReadableStream<Uint8Array>({ pull() { throw new Error("body read attempted"); } });
    const result = await guardedJsonFetch(built(), { lookupImpl, fetchImpl: async () => new Response(stream, { status: 200, headers: { "content-type": "text/html" } }) });
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("expected application/json") });
  });

  it("enforces one deadline across a slow-drip body", async () => {
    const drip = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((r) => setTimeout(r, 40));
        controller.enqueue(new TextEncoder().encode("x"));
      }
    });
    const started = Date.now();
    const result = await guardedJsonFetch(built(), {
      lookupImpl,
      fetchImpl: async () => new Response(drip, { status: 200, headers: { "content-type": "application/json" } }),
      timeoutMs: 150
    });
    expect(result.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(!result.ok && result.reason).toMatch(/deadline|timed out/i);
  });

  it("caps bodies whose content-length lies", async () => {
    const big = "x".repeat(300 * 1024);
    const result = await guardedJsonFetch(built(), { lookupImpl, fetchImpl: async () => new Response(`"${big}"`, { status: 200, headers: { "content-type": "application/json", "content-length": "10" } }) });
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("exceeds") });
  });
});
