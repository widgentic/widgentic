import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildAppTemplate } from "../index.js";

/**
 * Every Apps host fetches the template once per conversation, so its size
 * is a reviewed number: raising a budget is a deliberate edit here, never a
 * side effect of a feature.
 */
const RAW_BUDGET = 45_056; // 44 KiB
const GZIP_BUDGET = 13_312; // 13 KiB, gzip level 9

function overBudget(measure: string, measured: number, budget: number): string | undefined {
  return measured > budget
    ? `app template is ${measured} bytes ${measure}, over its ${budget}-byte budget`
    : undefined;
}

describe("app template size budget", () => {
  const template = buildAppTemplate();

  it("fits the raw budget", () => {
    expect(overBudget("raw", Buffer.byteLength(template), RAW_BUDGET)).toBeUndefined();
  });

  it("fits the gzipped budget", () => {
    const gzipped = gzipSync(template, { level: 9 }).length;
    expect(overBudget("gzipped", gzipped, GZIP_BUDGET)).toBeUndefined();
  });

  it("names the measured size and the budget when a template outgrows it", () => {
    expect(overBudget("raw", RAW_BUDGET + 1, RAW_BUDGET)).toBe(
      `app template is ${RAW_BUDGET + 1} bytes raw, over its ${RAW_BUDGET}-byte budget`
    );
    expect(overBudget("raw", RAW_BUDGET, RAW_BUDGET)).toBeUndefined();
  });
});

describe("served bridge compaction", () => {
  const script = buildAppTemplate().split("<script>")[1]?.split("</script>")[0] ?? "";

  it("serves the bridge without comment lines, blank lines or indentation", () => {
    expect(script.length).toBeGreaterThan(0);
    const lines = script.split("\n");
    expect(lines.filter((line) => line.trimStart().startsWith("//"))).toEqual([]);
    expect(lines.filter((line) => line.trim() === "")).toEqual([]);
    expect(lines.filter((line) => /^\s/.test(line))).toEqual([]);
  });

  it("holds no backtick, the invariant that makes compaction safe", () => {
    // A backtick would allow a multi-line string, whose lines could start
    // with whitespace or `//` that compaction must not touch.
    expect(script.includes("`")).toBe(false);
  });
});

