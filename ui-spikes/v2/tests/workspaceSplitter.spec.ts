import { expect, test } from "@playwright/test";

test("workspace splitter resizes shell only and persists width", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
  await expect(page.locator("#state-value")).toHaveText("idle");

  const workspace = page.locator("#cleaning-workspace");
  const splitter = page.locator("#workspace-splitter");

  await expect(splitter).toHaveAttribute("aria-valuenow", "43");
  await splitter.focus();
  await page.keyboard.press("ArrowRight");
  await expect(splitter).toHaveAttribute("aria-valuenow", "45");
  await expect(page.locator("#state-value")).toHaveText("idle");

  const beforeDrag = await splitter.getAttribute("aria-valuenow");
  const box = await splitter.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 90, box!.y + box!.height / 2);
  await page.mouse.up();

  const afterDrag = await splitter.getAttribute("aria-valuenow");
  expect(Number(afterDrag)).toBeGreaterThan(Number(beforeDrag));
  await expect(page.locator("#state-value")).toHaveText("idle");

  const stored = await page.evaluate(() =>
    localStorage.getItem("ocr2md-v2-workspace-split-v1"),
  );
  expect(stored).toBeTruthy();

  const cssWidth = await workspace.evaluate((element) =>
    element.style.getPropertyValue("--left-pane-width"),
  );
  expect(cssWidth).toContain("%");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
  await expect(page.locator("#workspace-splitter")).toHaveAttribute(
    "aria-valuenow",
    String(Math.round(Number(stored))),
  );
  await expect(page.locator("#state-value")).toHaveText("idle");
});
