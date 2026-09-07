import { expect, test } from "@playwright/test";

test("feature debug menu is a product-shell tool independent of workspace debug state", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");

  const toggle = page.locator("#ui-debug-toggle");
  const menu = page.locator("#ui-debug-menu");

  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();
  await expect(page.locator("nav #ui-debug-toggle")).toHaveCount(0);
  await expect(page.locator("#editor-pane > .pane-status #ui-debug-toggle")).toHaveCount(0);
  await expect(page.locator("#floating-debug-dock #ui-debug-toggle")).toHaveCount(1);
  await expect(page.locator("#floating-debug-dock #feature-debug-progress")).toHaveCount(1);
  await expect(page.locator("#floating-debug-dock .engineering-state")).toHaveCount(1);
  await expect(page.locator("#feature-debug-progress")).toBeVisible();
  await expect(page.locator("#feature-debug-progress-title")).toHaveText("尚无调试记录");

  const stepRect = await page.locator("#feature-debug-progress-summary").boundingBox();
  const debugRect = await toggle.boundingBox();
  const engineeringRect = await page.locator(".engineering-state > summary").boundingBox();
  expect(stepRect).toBeTruthy();
  expect(debugRect).toBeTruthy();
  expect(engineeringRect).toBeTruthy();
  expect(stepRect!.y).toBeLessThan(debugRect!.y);
  expect(debugRect!.y).toBeLessThan(engineeringRect!.y);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toBeVisible();
  await expect(page.locator("#ui-debug-initialize")).toBeEnabled();
  await expect(page.locator("#ui-debug-undo-redo")).toBeDisabled();

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();

  await expect(page.locator("#state-value")).not.toHaveText("debug");
});
