import { describe, it, expect } from "vitest";

describe("widgentic/actions entry", () => {
  it("depends only on widgentic modules and Node built-ins", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const files = readdirSync("src/actions").filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(`src/actions/${file}`, "utf8");
      for (const match of source.matchAll(/from "([^"]+)"/g)) {
        const specifier = match[1] ?? "";
        expect(specifier.startsWith(".") || specifier.startsWith("node:"), `${file}: ${specifier}`).toBe(true);
      }
    }
  });
});
