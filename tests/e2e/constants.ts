import { join } from "node:path";

export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
// Signed-in session for the test user, written by server.ts before the app starts.
export const STORAGE_STATE = join(__dirname, ".auth", "state.json");
// A second user who hasn't done Setup yet (tests/e2e/setup.spec.ts).
export const FRESH_STATE = join(__dirname, ".auth", "fresh.json");
