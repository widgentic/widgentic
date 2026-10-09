/**
 * The committed conformance corpus and the .NET sample's widget files must
 * equal a fresh generation — the bare-realm and .NET suites compare against
 * the files, so a stale file would let a behavior change pass unseen.
 * Regenerate with `npm run conformance:generate`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCorpus, buildSampleWidgets, CORPUS_PATH, SAMPLE_WIDGETS_DIR } from "./conformance-generate.js";
import type { Corpus } from "./conformance-generate.js";

const committed = JSON.parse(readFileSync(CORPUS_PATH, "utf8")) as Corpus;
const fresh = buildCorpus();

describe("conformance corpus", () => {
  it("has the configuration and the case list of a fresh generation", () => {
    expect(committed.config).toBe(fresh.config);
    expect(committed.cases.map((entry) => entry.name)).toEqual(fresh.cases.map((entry) => entry.name));
  });

  for (const entry of fresh.cases) {
    it(`is current for '${entry.name}'`, () => {
      expect(committed.cases.find((known) => known.name === entry.name)).toEqual(entry);
    });
  }

  it("keeps the .NET sample's widget files equal to the example widgets", () => {
    const expected = buildSampleWidgets();
    const files = readdirSync(SAMPLE_WIDGETS_DIR).filter((file) => file.endsWith(".json")).sort();
    expect(files).toEqual([...expected.keys()].sort());
    for (const [file, text] of expected) {
      expect(JSON.parse(readFileSync(join(SAMPLE_WIDGETS_DIR, file), "utf8")), file).toEqual(JSON.parse(text));
    }
  });
});
