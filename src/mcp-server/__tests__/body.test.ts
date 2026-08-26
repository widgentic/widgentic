// @vitest-environment node
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { BodyTooLargeError, positiveIntFromEnv, readBodyText } from "../index.js";

describe("bounded body reading", () => {
  it("reads small bodies and refuses oversized ones without buffering them", async () => {
    expect(await readBodyText(Readable.from([Buffer.from("{\"a\":"), Buffer.from("1}")]), 1024)).toBe('{"a":1}');
    const big = Readable.from(Array.from({ length: 10 }, () => Buffer.alloc(1024, "x")));
    await expect(readBodyText(big, 4096)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(big.destroyed).toBe(true);
  });

  it("parses positive integers from the environment with a fallback", () => {
    expect(positiveIntFromEnv("garbage", 60)).toBe(60);
    expect(positiveIntFromEnv(undefined, 60)).toBe(60);
    expect(positiveIntFromEnv("0", 60)).toBe(60);
    expect(positiveIntFromEnv("120.7", 60)).toBe(120);
  });
});
