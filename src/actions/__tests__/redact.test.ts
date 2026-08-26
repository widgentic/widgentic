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
