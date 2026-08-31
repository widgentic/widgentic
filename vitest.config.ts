import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));
const src = (pkg: string, rest = "index.ts"): string => resolve(root, "packages", pkg, "src", rest);

/**
 * Tests run on package SOURCES, never on dist: these aliases mirror the root
 * tsconfig `paths` so `@widgentic/*` resolves the same way for tsc, tsx and
 * vitest. Specific entries before the generic ones.
 */
const alias = [
  { find: /^@widgentic\/mcp\/sdk$/, replacement: src("mcp", "server/server.ts") },
  { find: /^@widgentic\/mcp\/authoring$/, replacement: src("mcp", "authoring/index.ts") },
  { find: /^@widgentic\/mcp\/store\/sqlite$/, replacement: src("mcp", "store/sqlite.ts") },
  { find: /^@widgentic\/mcp\/store\/cosmos$/, replacement: src("mcp", "store/cosmos.ts") },
  { find: /^@widgentic\/mcp\/store$/, replacement: src("mcp", "store/index.ts") },
  { find: /^@widgentic\/mcp\/secrets\/keyvault$/, replacement: src("mcp", "secrets/keyvault.ts") },
  { find: /^@widgentic\/mcp\/secrets$/, replacement: src("mcp", "secrets/index.ts") },
  { find: /^@widgentic\/mcp$/, replacement: src("mcp") },
  { find: /^@widgentic\/designer\/browser$/, replacement: src("designer", "browser.ts") },
  { find: /^@widgentic\/designer$/, replacement: src("designer") },
  { find: /^@widgentic\/core\/([a-z-]+)$/, replacement: src("core", "$1/index.ts") },
  { find: /^@widgentic\/core$/, replacement: src("core") }
];

const project = (name: string, include: string[], typecheck: string[] = []) => ({
  extends: true as const,
  test: {
    name,
    include,
    typecheck: {
      // Type suites run in the DEFAULT gate: a compile-time guarantee that
      // only runs when someone remembers `test:types` is not a guarantee.
      enabled: typecheck.length > 0,
      include: typecheck,
      tsconfig: "./tsconfig.json"
    }
  }
});

export default defineConfig({
  resolve: { alias },
  test: {
    globals: false,
    projects: [
      project("core", ["packages/core/src/**/__tests__/**/*.test.ts"], ["packages/core/src/**/__tests__/**/*.test-d.ts"]),
      project("designer", ["packages/designer/src/**/__tests__/**/*.test.ts"]),
      project("mcp", ["packages/mcp/src/**/__tests__/**/*.test.ts"], ["packages/mcp/src/**/__tests__/**/*.test-d.ts"]),
      // Examples are a guide, not a product: this project is deliberately
      // narrow (the identity rules, where being wrong is a security bug);
      // the rest rides on the workspace typecheck and the TESTING.md smoke.
      project("examples", ["examples/**/__tests__/**/*.test.ts"]),
      project("tools", ["tools/**/*.test.ts"])
    ]
  }
});
