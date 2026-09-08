import { expect, test } from "@playwright/test";

test("source pane keeps three content tabs and exposes regex as a shared drawer", async ({ page }) => {
  await page.goto("/");

  const tabs = page.locator("#editor-pane .source-tab");
  await expect(tabs).toHaveText(["源码", "自定义 CSS", "表格配置"]);

  const sourceTab = page.locator("#editor-tab-source");
  const cssTab = page.locator("#editor-tab-css");
  const tableConfigTab = page.locator("#editor-tab-table-config");
  const source = page.locator("#working-editor");
  const cssPanel = page.locator("#custom-css-wrap");
  const tableConfigPanel = page.locator("#table-config-wrap");
  const regexToggle = page.locator("#regex-search-toggle");
  const regexPanel = page.locator("#regex-search-panel");
  const regexTarget = page.locator("#regex-search-target");
  const calibrationGrid = page.locator("#calibration-grid");
  const tableConfigGrid = page.locator("#table-config-grid");
  const configModuleTab = page.locator("#config-module-tab");
  const chapterTitleModuleTab = page.locator('[data-review-module="章节标题"]');
  const preview = page.locator("#markdown-preview");

  await expect(sourceTab).toHaveAttribute("aria-selected", "true");
  await expect(source).toBeVisible();
  await expect(cssPanel).toBeHidden();
  await expect(tableConfigPanel).toBeHidden();
  await expect(regexPanel).toBeHidden();
  await expect(regexToggle).toHaveAttribute("aria-expanded", "false");

  await regexToggle.click();
  await expect(regexPanel).toBeVisible();
  await expect(regexToggle).toHaveAttribute("aria-expanded", "true");
  await expect(regexTarget).toHaveText("当前：源码");
  await expect(page.locator("#regex-search")).toBeFocused();
  await expect(source).toBeVisible();
  await expect(preview).toBeVisible();

  await cssTab.click();
  await expect(cssTab).toHaveAttribute("aria-selected", "true");
  await expect(source).toBeHidden();
  await expect(cssPanel).toBeVisible();
  await expect(tableConfigPanel).toBeHidden();
  await expect(regexPanel).toBeVisible();
  await expect(regexTarget).toHaveText("当前：自定义 CSS");
  await expect(page.locator("#custom-css-editor .cm-content")).toContainText("--ui-font-size");

  await tableConfigTab.click();
  await expect(tableConfigTab).toHaveAttribute("aria-selected", "true");
  await expect(source).toBeHidden();
  await expect(cssPanel).toBeHidden();
  await expect(tableConfigPanel).toBeVisible();
  await expect(regexPanel).toBeVisible();
  await expect(regexTarget).toHaveText("当前：表格配置");
  await expect(page.locator("#table-config-editor .cm-content")).toContainText("\"版本\": 2");
  await expect(calibrationGrid).toBeHidden();
  await expect(tableConfigGrid).toBeVisible();
  await expect(configModuleTab).toHaveAttribute("aria-pressed", "true");
  await expect(chapterTitleModuleTab).toHaveAttribute("aria-pressed", "false");

  await sourceTab.click();
  await expect(sourceTab).toHaveAttribute("aria-selected", "true");
  await expect(regexTarget).toHaveText("当前：源码");
  await expect(calibrationGrid).toBeVisible();
  await expect(tableConfigGrid).toBeHidden();
  await expect(configModuleTab).toHaveAttribute("aria-pressed", "false");
  await expect(chapterTitleModuleTab).toHaveAttribute("aria-pressed", "true");

  await page.locator("#regex-search-close").click();
  await expect(regexPanel).toBeHidden();
  await expect(regexToggle).toHaveAttribute("aria-expanded", "false");
  await expect(source).toBeVisible();
  await expect(preview).toBeVisible();

  const defaults = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      profile: document.documentElement.dataset.deviceProfile,
      ui: style.getPropertyValue("--ui-font-size").trim(),
      grid: style.getPropertyValue("--grid-font-size").trim(),
      right: style.getPropertyValue("--right-font-size").trim(),
    };
  });
  expect(["ipad", "mac"]).toContain(defaults.profile);
  expect(defaults.ui).toBe("13px");
  expect(defaults.grid).toBe("13px");
  expect(defaults.right).toBe("14px");
});
