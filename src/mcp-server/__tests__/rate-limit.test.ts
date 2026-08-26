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
