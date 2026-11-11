import { expect, test } from "@playwright/test";

// The test user has no Dokploy yet. Until they connect one, the side menu
// pages don't open: a click says to connect first (lib/setup-gate.ts). The
// overview (the connect screen) and Releases stay open.

const HELD = ["Connections", "Integrations", "Tools", "Policies", "Activity", "Members", "Settings"];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /Connect your\s+Dokploy/ })).toBeVisible();
});

test("every held-back menu page opens the connect-first modal and stays on the overview", async ({ page }) => {
  const menu = page.getByRole("navigation", { name: "Dashboard" });
  for (const label of HELD) {
    await menu.getByRole("link", { name: label, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /Connect your\s+Dokploy first/ });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/app$/);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});

test("the modal's button shakes the heading and puts the cursor in the form", async ({ page }) => {
  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Connect Dokploy" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#zq-connect-dokploy")).toHaveClass(/is-shaking/);
  await expect(page.locator("#base_url")).toBeFocused();
});

test("a held-back page opened by its address goes to the overview and says why", async ({ page }) => {
  await page.goto("/app/connections");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("dialog", { name: /Connect your\s+Dokploy first/ })).toBeVisible();
});

test("Releases stays open", async ({ page }) => {
  await page.goto("/app/releases");
  await expect(page).toHaveURL(/\/app\/releases$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".zq-rel").first()).toBeVisible();
});
