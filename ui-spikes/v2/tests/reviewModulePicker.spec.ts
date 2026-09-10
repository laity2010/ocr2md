import { expect, test } from "@playwright/test";

test("data table bar groups chapter element modules into one dropdown", async ({ page }) => {
  await page.goto("/");
  await page.locator("#chapter-select").selectOption({
    label: "chapters/01 Buffett’s Alpha",
  });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const tabs = page.locator(
    "#chapter-element-tab, #review-module-tabs > [data-review-module=\"变动行\"], #config-module-tab",
  );
  await expect(tabs).toHaveText(["章节标题 ▾", "变动行", "配置"]);

  const picker = page.locator("#chapter-element-tab");
  const menu = page.locator("#chapter-element-menu");
  await expect(picker).toHaveAttribute("aria-pressed", "true");
  await expect(menu).toBeHidden();

  await picker.click();
  await expect(menu).toBeVisible();
  await expect(menu.locator("[data-review-module]")).toHaveText([
    "章节标题",
    "注释",
    "嵌入块",
    "非法断行",
    "媒体",
  ]);

  await menu.locator('[data-review-module="注释"]').click();
  await expect(menu).toBeHidden();
  await expect(page.locator("#active-review-module")).toHaveText("注释");
  await expect(picker).toHaveText("注释 ▾");
  await expect(picker).toHaveAttribute("aria-pressed", "true");

  await page.locator('[data-review-module="变动行"]').click();
  await expect(page.locator("#active-review-module")).toHaveText("变动行");
  await expect(picker).toHaveText("章节元素 ▾");
  await expect(picker).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-review-module="变动行"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.locator("#config-module-tab").click();
  await expect(page.locator("#table-config-grid")).toBeVisible();
  await expect(picker).toHaveText("章节元素 ▾");
  await expect(page.locator("#config-module-tab")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator('[data-review-module="变动行"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await picker.click();
  await expect(menu).toBeVisible();
  await menu.locator('[data-review-module="章节标题"]').click();
  await expect(page.locator("#calibration-grid")).toBeVisible();
  await expect(page.locator("#active-review-module")).toHaveText("章节标题");
  await expect(picker).toHaveText("章节标题 ▾");
  await expect(picker).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#config-module-tab")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
