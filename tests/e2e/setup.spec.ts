import { expect, test } from "@playwright/test";
import { FRESH_STATE } from "./constants";

// Someone who hasn't done Setup sees only Setup (app/[org]/(account)/setup):
// every other page shows in the menu but opens "Finish setup first", and a
// page opened by its address comes back to Setup.

test.use({ storageState: FRESH_STATE });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
});

test("signing in lands on Setup, step 1", async ({ page }) => {
  await page.goto("/signin");
  await expect(page).toHaveURL(/\/[a-z0-9_]+\/setup$/);
  await expect(page.getByRole("heading", { name: /Connect your\s+Dokploy/ })).toBeVisible();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
});

test("every other menu page opens the finish-setup modal", async ({ page }) => {
  await page.goto("/signin");
  await expect(page).toHaveURL(/\/setup$/);
  const menu = page.getByRole("complementary", { name: "Menu" });
  for (const label of ["Workspaces", "Dokploy Instances", "Policies", "Members", "Settings"]) {
    await menu.getByRole("link", { name: label, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Finish setup first" });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/setup$/);
    await page.getByRole("button", { name: "Continue setup" }).click();
    await expect(dialog).toBeHidden();
  }
});

test("a page opened by its address comes back to Setup and says why", async ({ page }) => {
  await page.goto("/signin");
  await expect(page).toHaveURL(/\/setup$/);
  const account = new URL(page.url()).pathname.replace(/\/setup$/, "");
  await page.goto(`${account}/members`);
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("dialog", { name: "Finish setup first" })).toBeVisible();
});
