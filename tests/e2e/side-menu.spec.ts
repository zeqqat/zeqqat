import { expect, test, type Page } from "@playwright/test";

// The side menu sits beside the page and pushes it, with no overlay, and
// can stay open while you work. It must animate in both directions. That
// has regressed before, with one direction kept and the other dropped, so
// each is tested on its own. getAnimations() reports CSS transitions, CSS
// animations and Web Animations alike.

const PANEL = 'aside[aria-label="Menu"]';
const BURGER = "button.zq-burger";

async function clickAndReadPanelAnimations(page: Page) {
  return page.evaluate(
    async ({ buttonSelector, panelSelector }) => {
      document.querySelector<HTMLElement>(buttonSelector)!.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const panel = document.querySelector(panelSelector);
      if (!panel) return [];
      return panel
        .getAnimations()
        .filter((a) => a.playState === "running")
        .map((a) => Number(a.effect?.getComputedTiming().duration ?? 0));
    },
    { buttonSelector: BURGER, panelSelector: PANEL },
  );
}

async function settle(page: Page) {
  await page.locator(PANEL).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/app");
  await expect(page.locator(BURGER)).toBeVisible();
});

test("on a wide screen the menu starts open and pushes the page, with no overlay", async ({ page }) => {
  const menu = page.getByRole("complementary", { name: "Menu" });
  await expect(menu).toBeVisible();
  await settle(page);
  const side = await menu.boundingBox();
  const main = await page.locator("main.zq-main").boundingBox();
  expect(side!.width).toBeGreaterThan(150);
  expect(main!.x).toBeGreaterThanOrEqual(side!.x + side!.width - 1);
  await expect(page.locator(".zq-scrim")).toHaveCount(0);
  // The page next to the menu is still the thing under the pointer.
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("main") !== null, {
    x: main!.x + main!.width / 2,
    y: main!.y + 40,
  });
  expect(hit).toBe(true);
});

test("the menu button closes and reopens it, and the page takes the space back", async ({ page }) => {
  const menu = page.getByRole("complementary", { name: "Menu" });
  await settle(page);
  await page.locator(BURGER).click();
  await expect(menu).toBeHidden();
  await settle(page);
  const main = await page.locator("main.zq-main").boundingBox();
  expect(main!.x).toBeLessThan(5);

  await page.locator(BURGER).click();
  await expect(menu).toBeVisible();
});

test("closing the menu is animated", async ({ page }) => {
  await settle(page);
  const durations = await clickAndReadPanelAnimations(page);
  expect(durations.some((d) => d > 0), "no running animation on the panel while closing").toBe(true);
  await expect(page.getByRole("complementary", { name: "Menu" })).toBeHidden();
});

test("opening the menu is animated", async ({ page }) => {
  await page.locator(BURGER).click();
  await expect(page.getByRole("complementary", { name: "Menu" })).toBeHidden();
  await settle(page);
  const durations = await clickAndReadPanelAnimations(page);
  expect(durations.some((d) => d > 0), "no running animation on the panel while opening").toBe(true);
  await expect(page.getByRole("complementary", { name: "Menu" })).toBeVisible();
});

test("the menu stays the way you left it across pages", async ({ page }) => {
  // The test user has no Dokploy yet, so Releases and the overview are the
  // only pages that open (tests/e2e/connect-first.spec.ts).
  const menu = page.getByRole("complementary", { name: "Menu" });
  await page.goto("/app/releases");
  await expect(page).toHaveURL(/\/app\/releases/);
  await expect(menu).toBeVisible();

  await page.locator(BURGER).click();
  await expect(menu).toBeHidden();
  await page.goto("/app");
  await expect(page.getByRole("complementary", { name: "Menu" })).toBeHidden();
});
