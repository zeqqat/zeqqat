import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Browser tests live in tests/e2e and run under Playwright, not here.
    include: ["tests/unit/**/*.test.ts", "tests/regression/**/*.test.ts"],
  },
});
