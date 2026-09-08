import { expect, test } from "@playwright/test";
import { CUSTOM_CSS_STORAGE_KEY } from "../src/customCssEditor";

const LEGACY_CSS = `:root[data-device-profile="ipad"] {
  --ui-font-size: 13px;
  --grid-font-size: 13px;
  --right-font-size: 14px;
}

:root[data-device-profile="mac"] {
  --ui-font-size: 13px;
  --grid-font-size: 13px;
  --right-font-size: 14px;
}
`;

test("custom CSS exposes regex colors in a shared all-platform root block and migrates legacy stored CSS", async ({ page }) => {
  await page.addInitScript(
    ({ key, source }) => localStorage.setItem(key, source),
    { key: CUSTOM_CSS_STORAGE_KEY, source: LEGACY_CSS },
  );

  await page.goto("/");
  await page.locator("#chapter-select").selectOption({
    label: "chapters/01 Buffett’s Alpha",
  });
  await page.locator("#editor-tab-css").click();

  const content = page.locator("#custom-css-editor .cm-content");
  await expect(content).toContainText("通用：iPad / Mac 共用");
  await expect(content).toContainText("--regex-match-bg");
  await expect(content).toContainText("--regex-match-current-bg");
  await expect(content).toContainText("--regex-match-current-border");
  await expect(content).toContainText("--ui-font-size: 13px");

  const defaults = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      match: style.getPropertyValue("--regex-match-bg").trim(),
      current: style.getPropertyValue("--regex-match-current-bg").trim(),
      border: style.getPropertyValue("--regex-match-current-border").trim(),
    };
  });
  expect(defaults.match).not.toBe("");
  expect(defaults.current).not.toBe("");
  expect(defaults.border).not.toBe("");

  const custom = `/* 通用：iPad / Mac 共用 */
:root {
  --regex-match-bg: rgb(10, 20, 30);
  --regex-match-current-bg: rgb(40, 50, 60);
  --regex-match-current-border: rgb(70, 80, 90);
}

${LEGACY_CSS}`;

  await content.click();
  await content.press("ControlOrMeta+A");
  await content.fill(custom);

  await expect.poll(async () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--regex-match-current-bg")
        .trim()
    )
  ).toBe("rgb(40, 50, 60)");

  await page.locator("#editor-tab-source").click();
  await page.locator("#regex-search-toggle").click();
  await page.locator("#regex-search").fill("Buffett");

  const current = page.locator(
    "#working-editor .cm-regex-match-current",
  );
  await expect(current).toBeVisible();
  await expect.poll(async () =>
    current.evaluate((node) => getComputedStyle(node).backgroundColor)
  ).toBe("rgb(40, 50, 60)");
  await expect.poll(async () =>
    current.evaluate((node) => getComputedStyle(node).outlineColor)
  ).toBe("rgb(70, 80, 90)");

  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
});
