import { expect, test } from "@playwright/test";

test("shared regex drawer follows Source, Custom CSS, and Table Config targets", async ({ page, request }) => {
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const target = catalog.chapters.find(
    (chapter) => chapter.ready && chapter.name === "01 Buffett’s Alpha",
  );
  expect(target).toBeTruthy();

  const payload = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{ workingText: string }>,
    );

  const sourceCount = Array.from(
    payload.workingText.matchAll(/Buffett/gimu),
  ).length;
  expect(sourceCount).toBeGreaterThan(1);

  await page.goto("/");
  await page.locator("#chapter-select").selectOption({ label: "chapters/01 Buffett’s Alpha" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const input = page.locator("#regex-search");
  const status = page.locator("#search-status");
  const targetLabel = page.locator("#regex-search-target");

  await page.locator("#regex-search-toggle").click();
  await expect(page.locator("#regex-search-panel")).toBeVisible();
  await expect(targetLabel).toHaveText("当前：源码");
  await expect(page.locator("#regex-search-panel #search-status")).toHaveCount(1);
  await expect(
    page.locator(".editor-pane > .pane-status #search-status"),
  ).toHaveCount(0);

  await input.click();
  await page.keyboard.type("Buffett", { delay: 60 });
  await expect(input).toHaveValue("Buffett");
  await expect(input).toBeFocused();
  await expect(status).toHaveText(
    sourceCount + " 个匹配 · 1/" + sourceCount,
  );
  const sourceCurrent = page.locator(
    "#working-editor .cm-regex-match-current",
  );
  await expect(sourceCurrent).toBeVisible();
  await expect(sourceCurrent).toContainText("Buffett");
  const sourceHighlightStyle = await sourceCurrent.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      outline: style.outlineStyle,
    };
  });
  expect(sourceHighlightStyle.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(sourceHighlightStyle.outline).not.toBe("none");

  await page.locator("#search-next").click();
  await expect(status).toHaveText(
    sourceCount + " 个匹配 · 2/" + sourceCount,
  );

  await page.locator("#editor-tab-css").click();
  await expect(targetLabel).toHaveText("当前：自定义 CSS");
  await input.fill("--ui-font-size");
  await expect(status).toContainText("个匹配 · 1/");
  await expect(status).not.toHaveText("0 个匹配");
  await expect(
    page.locator("#custom-css-editor .cm-regex-match-current"),
  ).toBeVisible();

  await page.locator("#editor-tab-table-config").click();
  await expect(targetLabel).toHaveText("当前：配置");
  await input.fill("columns");
  await expect(status).toContainText("个匹配 · 1/");
  await expect(status).not.toHaveText("0 个匹配");
  await expect(
    page.locator("#table-config-editor .cm-regex-match-current"),
  ).toBeVisible();

  await input.fill("[");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(status).toContainText("正则错误：");
  await expect(page.locator("#search-prev")).toBeDisabled();
  await expect(page.locator("#search-next")).toBeDisabled();
  await expect(
    page.locator("#table-config-editor .cm-regex-match"),
  ).toHaveCount(0);

  await input.fill("");
  await expect(status).toHaveText("");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
});
