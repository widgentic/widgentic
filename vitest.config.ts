import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["src/**/__tests__/**/*.test.ts", "apps/**/__tests__/**/*.test.ts"],
    typecheck: {
      enabled: false,
      include: ["src/**/__tests__/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json"
    }
  }
});
