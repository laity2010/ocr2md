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

test("workspace splitter clamps an old wide split so iPad editor actions stay inside the viewport", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ocr2md-v2-workspace-split-v1", "70");
  });

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");

  await expect(page.locator("#close")).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        width: box.width,
      };
    };
    return {
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      workspace: rect("#cleaning-workspace"),
      editor: rect("#editor-pane"),
      regex: rect("#regex-search-toggle"),
      split: Number(
        document.querySelector("#workspace-splitter")
          ?.getAttribute("aria-valuenow"),
      ),
      stored: Number(
        localStorage.getItem("ocr2md-v2-workspace-split-v1"),
      ),
    };
  });

  expect(layout.split).toBeLessThan(70);
  expect(layout.stored).toBeLessThan(70);
  expect(layout.editor.right).toBeLessThanOrEqual(layout.workspace.right + 0.5);
  expect(layout.regex.right).toBeLessThanOrEqual(layout.editor.right + 0.5);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);

  await page.locator("#regex-search-toggle").click();
  await page.locator("#regex-search").fill("Buffett");

  const openLayout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const node = document.querySelector(selector)!;
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        width: box.width,
        scrollWidth: (node as HTMLElement).scrollWidth,
        clientWidth: (node as HTMLElement).clientWidth,
      };
    };
    return {
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      editor: rect("#editor-pane"),
      menu: rect("#editor-pane > .pane-menu"),
      regex: rect("#regex-search-toggle"),
      panel: rect("#regex-search-panel"),
      toolbar: rect(".regex-panel-toolbar"),
    };
  });

  expect(openLayout.editor.scrollWidth).toBeLessThanOrEqual(
    openLayout.editor.clientWidth,
  );
  expect(openLayout.menu.right).toBeLessThanOrEqual(openLayout.editor.right + 0.5);
  expect(openLayout.regex.right).toBeLessThanOrEqual(openLayout.editor.right + 0.5);
  expect(openLayout.panel.right).toBeLessThanOrEqual(openLayout.editor.right + 0.5);
  expect(openLayout.toolbar.scrollWidth).toBeLessThanOrEqual(
    openLayout.toolbar.clientWidth,
  );
  expect(openLayout.scrollWidth).toBeLessThanOrEqual(openLayout.viewport);
  await expect(page.locator("#regex-search-panel")).toBeVisible();
  await expect(page.locator("#regex-search")).toHaveValue("Buffett");
});
