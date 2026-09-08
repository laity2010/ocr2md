import { expect, test } from "@playwright/test";

test("source pane has Source, Custom CSS, Table Config, and Regex Search as four peer tabs", async ({ page }) => {
  await page.goto("/");

  const tabs = page.locator("#editor-pane .source-tab");
  await expect(tabs).toHaveText(["源码", "自定义 CSS", "表格配置", "正则搜索"]);

  const sourceTab = page.locator("#editor-tab-source");
  const cssTab = page.locator("#editor-tab-css");
  const tableConfigTab = page.locator("#editor-tab-table-config");
  const regexTab = page.locator("#editor-tab-regex");
  const source = page.locator("#working-editor");
  const cssPanel = page.locator("#custom-css-wrap");
  const tableConfigPanel = page.locator("#table-config-wrap");
  const regexPanel = page.locator("#regex-search-panel");
  const preview = page.locator("#markdown-preview");

  await expect(sourceTab).toHaveAttribute("aria-selected", "true");
  await expect(cssTab).toHaveAttribute("aria-selected", "false");
  await expect(tableConfigTab).toHaveAttribute("aria-selected", "false");
  await expect(regexTab).toHaveAttribute("aria-selected", "false");
  await expect(source).toBeVisible();
  await expect(cssPanel).toBeHidden();
  await expect(tableConfigPanel).toBeHidden();
  await expect(regexPanel).toBeHidden();
  await expect(preview).toBeVisible();

  const previewBox = await preview.boundingBox();
  expect(previewBox).not.toBeNull();

  await cssTab.click();
  await expect(sourceTab).toHaveAttribute("aria-selected", "false");
  await expect(cssTab).toHaveAttribute("aria-selected", "true");
  await expect(source).toBeHidden();
  await expect(cssPanel).toBeVisible();
  await expect(tableConfigPanel).toBeHidden();
  await expect(regexPanel).toBeHidden();
  await expect(page.locator("#custom-css-editor .cm-content")).toContainText(
    "--ui-font-size",
  );
  await expect(page.locator("#custom-css-editor .cm-content")).toContainText(
    "--grid-font-size",
  );
  await expect(page.locator("#custom-css-editor .cm-content")).toContainText(
    "--right-font-size",
  );
  await expect(page.locator("#css-save")).toBeVisible();
  await expect(page.locator("#css-reset")).toBeVisible();
  await expect(preview).toBeVisible();

  await tableConfigTab.click();
  await expect(tableConfigTab).toHaveAttribute("aria-selected", "true");
  await expect(source).toBeHidden();
  await expect(cssPanel).toBeHidden();
  await expect(tableConfigPanel).toBeVisible();
  await expect(regexPanel).toBeHidden();
  await expect(page.locator("#table-config-editor .cm-content")).toContainText(
    "\"version\": 1",
  );
  await expect(page.locator("#table-config-save")).toBeVisible();
  await expect(page.locator("#table-config-reset")).toBeVisible();
  await expect(preview).toBeVisible();

  await regexTab.click();
  await expect(regexTab).toHaveAttribute("aria-selected", "true");
  await expect(source).toBeHidden();
  await expect(cssPanel).toBeHidden();
  await expect(tableConfigPanel).toBeHidden();
  await expect(regexPanel).toBeVisible();
  await expect(page.locator("#regex-search")).toBeVisible();
  await expect(page.locator("#search-case")).toBeVisible();
  await expect(page.locator("#search-prev")).toBeVisible();
  await expect(page.locator("#search-next")).toBeVisible();
  await expect(preview).toBeVisible();

  await sourceTab.click();
  await expect(sourceTab).toHaveAttribute("aria-selected", "true");
  await expect(source).toBeVisible();
  await expect(cssPanel).toBeHidden();
  await expect(tableConfigPanel).toBeHidden();
  await expect(regexPanel).toBeHidden();

  const finalPreviewBox = await preview.boundingBox();
  expect(finalPreviewBox).not.toBeNull();
  expect(Math.abs(finalPreviewBox!.y - previewBox!.y)).toBeLessThanOrEqual(1);

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
