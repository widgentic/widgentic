// @vitest-environment happy-dom
/**
 * The public API surface as a reviewed artifact: the sorted runtime export
 * names of every published entry are snapshotted, so surface growth or loss
 * shows up as a diff in review (design D10). Type-only exports are not
 * visible at runtime and are covered by the type suites instead.
 */
import { describe, expect, it } from "vitest";

const ENTRIES = [
  "@widgentic/core",
  "@widgentic/core/contract",
  "@widgentic/core/adapters",
  "@widgentic/core/mapper",
  "@widgentic/core/catalog",
  "@widgentic/core/theming",
  "@widgentic/core/templates",
  "@widgentic/core/actions",
  "@widgentic/core/reactive",
  "@widgentic/designer",
  "@widgentic/mcp",
  "@widgentic/mcp/sdk",
  "@widgentic/mcp/store",
  "@widgentic/mcp/store/cosmos",
  "@widgentic/mcp/secrets",
  "@widgentic/mcp/secrets/keyvault"
] as const;

describe("published export surfaces", () => {
  for (const entry of ENTRIES) {
    it(entry, async () => {
      const mod = (await import(/* @vite-ignore */ entry)) as Record<string, unknown>;
      const names = Object.keys(mod).sort();
      expect(names.length).toBeGreaterThan(0);
      expect(names).toMatchSnapshot();
    });
  }
});
