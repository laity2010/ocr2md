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
  await expect(content).toContainText("--source-selection-bg: rgba(10, 132, 255, 0.32)");
  await expect(content).toContainText("--regex-match-bg");
  await expect(content).toContainText("--regex-match-current-bg");
  await expect(content).toContainText("--regex-match-current-border");
  await expect(content).toContainText("--footnote-ref-size: 1.25em");
  await expect(content).toContainText("--ui-font-size: 13px");

  const defaults = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      match: style.getPropertyValue("--regex-match-bg").trim(),
      current: style.getPropertyValue("--regex-match-current-bg").trim(),
      border: style.getPropertyValue("--regex-match-current-border").trim(),
      selection: style.getPropertyValue("--source-selection-bg").trim(),
      footnoteSize: style.getPropertyValue("--footnote-ref-size").trim(),
    };
  });
  expect(defaults.match).not.toBe("");
  expect(defaults.current).not.toBe("");
  expect(defaults.border).not.toBe("");
  expect(defaults.selection).toBe("rgba(10, 132, 255, 0.32)");
  expect(defaults.footnoteSize).toBe("1.25em");

  const custom = `/* 通用：iPad / Mac 共用 */
:root {
  --source-selection-bg: rgb(11, 22, 33);
  --regex-match-bg: rgb(10, 20, 30);
  --regex-match-current-bg: rgb(40, 50, 60);
  --regex-match-current-border: rgb(70, 80, 90);
  --footnote-ref-size: 2em;
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
  await expect.poll(async () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--footnote-ref-size")
        .trim()
    )
  ).toBe("2em");

  await page.locator("#editor-tab-source").click();
  const sourceContent = page.locator("#working-editor .cm-content");
  await sourceContent.click();
  await page.keyboard.press("ControlOrMeta+A");
  const drawnSelection = page.locator(
    "#working-editor .cm-selectionLayer .cm-selectionBackground",
  ).first();
  await expect(drawnSelection).toBeVisible();
  await expect.poll(async () =>
    drawnSelection.evaluate((node) => getComputedStyle(node).backgroundColor)
  ).toBe("rgb(11, 22, 33)");
  await page.keyboard.press("ArrowRight");
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

test("adding source selection color preserves existing custom CSS comments verbatim", async ({ page }) => {
  const commentA = "/* 用户注释：源码颜色不要动 */";
  const commentB = "/* 用户注释：这行也必须原样保留 */";
  const stored = `${commentA}\n:root {\n  ${commentB}\n  --regex-match-bg: rgb(1, 2, 3);\n  --regex-match-current-bg: rgb(4, 5, 6);\n  --regex-match-current-border: rgb(7, 8, 9);\n  --footnote-ref-size: 1.25em;\n}\n\n${LEGACY_CSS}`;
  await page.addInitScript(
    ({ key, source }) => localStorage.setItem(key, source),
    { key: CUSTOM_CSS_STORAGE_KEY, source: stored },
  );

  await page.goto("/");
  await page.locator("#editor-tab-css").click();
  const content = page.locator("#custom-css-editor .cm-content");
  await expect(content).toContainText(commentA);
  await expect(content).toContainText(commentB);
  await expect(content).toContainText("--source-selection-bg: rgba(10, 132, 255, 0.32)");

  await page.locator("#css-save").click();
  const saved = await page.evaluate(
    (key) => localStorage.getItem(key) ?? "",
    CUSTOM_CSS_STORAGE_KEY,
  );
  expect(saved).toContain(commentA);
  expect(saved).toContain(commentB);
});
