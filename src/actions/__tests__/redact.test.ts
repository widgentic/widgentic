import { describe, it, expect } from "vitest";
import { redactText, redactValue } from "../index.js";

describe("redaction", () => {
  it("scrubs every occurrence of each secret from text", () => {
    expect(redactText('401 {"error":"invalid key sk-live-123"} sk-live-123', ["sk-live-123"])).toBe('401 {"error":"invalid key ***"} ***');
    expect(redactText("nothing here", ["", "zzz"])).toBe("nothing here");
  });

  it("walks arrays and objects, leaving structure and non-strings intact", () => {
    const value = { message: "token abc", nested: [{ text: "abc!" }, 5, null], n: 1 };
    expect(redactValue(value, ["abc"])).toEqual({ message: "token ***", nested: [{ text: "***!" }, 5, null], n: 1 });
    expect(redactValue(value, [])).toBe(value);
  });
});

describe("hardening: encoded forms, keys, overlaps", () => {
  it("scrubs percent-encoded and JSON-escaped forms and object keys", () => {
    const secret = 'sk+live/1"x';
    const echoed = `url ?key=${encodeURIComponent(secret)} body ${JSON.stringify({ k: secret })}`;
    const out = redactText(echoed, [secret]);
    expect(out).not.toContain("sk%2Blive");
    expect(out).not.toContain('sk+live/1\\"x');
    expect(out).toContain("***");
    expect(redactValue({ [secret]: 1, nested: { "x sk+live/1\"x": secret } }, [secret])).toEqual({ "***": 1, nested: { "x ***": "***" } });
  });

  it("longer secrets are scrubbed whole when one contains another", () => {
    expect(redactText("token abcdef and abc", ["abc", "abcdef"])).toBe("token *** and ***");
  });
});
