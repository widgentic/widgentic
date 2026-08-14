import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["src/**/__tests__/**/*.test.ts", "apps/**/__tests__/**/*.test.ts"],
    typecheck: {
      // Type suites run in the DEFAULT gate: a compile-time guarantee
      // that only runs when someone remembers `test:types` is not a
      // guarantee (the read-only-store-handle proof lives here).
      enabled: true,
      include: ["src/**/__tests__/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json"
    }
  }
});
