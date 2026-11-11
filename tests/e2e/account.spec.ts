import { expect, test } from "@playwright/test";

// The account menu's name line opens /app/account, where you change your
// picture, name and username. A renamed account keeps its old username:
// old public links redirect, and nobody else can take it.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
});

test("the name line in the account menu opens the profile page, even before Dokploy is connected", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Account menu" }).click();
  const id = page.locator(".zq-pop-user");
  await expect(id).toHaveAttribute("href", "/app/account");
  await page.screenshot({ path: "test-results/account-menu.png" });
  await id.click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Username")).toBeVisible();
});

test("changing the username warns first, saves, and the old username redirects", async ({ page }) => {
  await page.goto("/app/account");
  const field = page.getByLabel("Username");
  const old = await field.inputValue();
  const next = `${old}_renamed`.slice(0, 39);

  await field.fill(next);
  await expect(page.getByRole("note")).toContainText(`Old links with @${old} keep working`);
  await page.screenshot({ path: "test-results/account-rename-warning.png", fullPage: true });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText(`You're @${next} now`);

  await page.goto(`/${old}`);
  await expect(page).toHaveURL(new RegExp(`/${next}$`));

  // Back to the original, which takes the old name back.
  await page.goto("/app/account");
  await page.getByLabel("Username").fill(old);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText(`You're @${old} now`);
  await page.goto(`/${next}`);
  await expect(page).toHaveURL(new RegExp(`/${old}$`));
});

test("a reserved username is refused", async ({ page }) => {
  await page.goto("/app/account");
  await page.getByLabel("Username").fill("admin");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".zq-account [role=alert]")).toContainText("reserved");
});

test("the side menu ends with the pattern strip under the version", async ({ page }) => {
  await page.goto("/app/releases");
  const strip = page.locator(".zq-side-pattern");
  await expect(strip).toBeVisible();
  const box = await strip.boundingBox();
  expect(Math.round(box!.height)).toBe(10);
  await page.screenshot({ path: "test-results/side-pattern.png" });
});
