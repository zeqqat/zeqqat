import { expect, type Page } from "@playwright/test";

// Signed in, /signin lands on your account page (/<username>); the first
// workspace card opens that workspace. Returns its address, e.g.
// /gaita/default, for building the workspace's page URLs.
export async function openFirstWorkspace(page: Page): Promise<string> {
  await page.goto("/signin");
  await page.locator(".zq-acc-card").first().click();
  await expect(page).toHaveURL(/^[^?]*\/[a-z0-9_]+\/[a-z0-9-]+$/);
  return new URL(page.url()).pathname;
}
