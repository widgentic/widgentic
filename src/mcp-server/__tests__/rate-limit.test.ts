import { describe, expect, it } from "vitest";
import { createExecutionLimiter } from "../index.js";

describe("execution limiter", () => {
  it("allows the configured burst, then refuses until tokens refill, per principal", () => {
    let clock = 0;
    const limiter = createExecutionLimiter(3, () => clock);
    expect([limiter.take("a"), limiter.take("a"), limiter.take("a")]).toEqual([true, true, true]);
    expect(limiter.take("a")).toBe(false);
    expect(limiter.take("b")).toBe(true); // another principal has its own bucket
    clock += 20_000; // a third of a minute → one token back
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
    clock += 60_000;
    expect([limiter.take("a"), limiter.take("a"), limiter.take("a")]).toEqual([true, true, true]);
  });
});

describe("execution limiter hardening", () => {
  it("falls back to the default for non-finite rates and tolerates clock regression", () => {
    let clock = 60_000;
    const nan = createExecutionLimiter(Number("garbage"), () => clock);
    expect(nan.take("a")).toBe(true); // not NaN-refused
    const limiter = createExecutionLimiter(2, () => clock);
    expect([limiter.take("a"), limiter.take("a"), limiter.take("a")]).toEqual([true, true, false]);
    clock -= 30_000; // clock steps back: no drain below zero, no refill
    expect(limiter.take("a")).toBe(false);
    clock += 90_000; // a full minute later relative to the last refill
    expect(limiter.take("a")).toBe(true);
  });
});
