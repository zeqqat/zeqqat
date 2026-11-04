import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, STORAGE_STATE } from "./tests/e2e/constants";

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: E2E_BASE_URL,
    storageState: STORAGE_STATE,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Starts its own Postgres and test user; see tests/e2e/server.ts.
    command: "pnpm exec tsx tests/e2e/server.ts",
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
  },
});
