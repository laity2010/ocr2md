import { expect, test } from "@playwright/test";

test("navigation select owns current path and review tags follow node context", async ({ page, request }) => {
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const chapter = catalog.chapters.find(
    (item) => item.ready && item.name === "01 Buffett’s Alpha",
  ) ?? catalog.chapters.find((item) => item.ready);
  expect(chapter).toBeTruthy();

  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");

  const navigation = page.locator("#chapter-select");
  await expect(navigation.locator('option[value="__node_ocr__"]')).toBeEnabled();

  await navigation.selectOption("__node_ocr__");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(navigation.locator("option:checked")).toHaveText("ocr");
  await expect(page.locator('[data-review-module="章节定界"]')).toBeVisible();
  await expect(page.locator('[data-review-module="章节标题"]')).toBeHidden();
  await expect(page.locator('[data-review-module="注释"]')).toBeHidden();
  await expect(page.locator('[data-review-module="嵌入块"]')).toBeHidden();
  await expect(page.locator('[data-review-module="非法断行"]')).toBeHidden();
  await expect(page.locator('#calibration-grid [role="columnheader"]')).toContainText([
    "行号",
    "行类型",
    "章节文件",
    "预览",
  ]);

  await navigation.selectOption(chapter!.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(navigation.locator("option:checked")).toHaveText(
    "chapters/" + chapter!.name,
  );
  await expect(page.locator('[data-review-module="章节定界"]')).toBeHidden();
  await expect(page.locator('[data-review-module="章节标题"]')).toBeVisible();
  await expect(page.locator('[data-review-module="注释"]')).toBeVisible();
  await expect(page.locator('[data-review-module="嵌入块"]')).toBeVisible();
  await expect(page.locator('[data-review-module="非法断行"]')).toBeVisible();
  await expect(page.locator('#calibration-grid [role="columnheader"]')).toContainText([
    "行号",
    "行类型",
    "标题预览",
  ]);
  const editor = page.locator("#working-editor .cm-content");
  await editor.click();
  await page.keyboard.type("X");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");

  await navigation.selectOption("__node_ocr__");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(navigation).toHaveValue(chapter!.id);
  await expect(navigation.locator("option:checked")).toHaveText(
    "chapters/" + chapter!.name,
  );
  await expect(page.locator("#source-location-status")).toContainText(
    "当前章节有未保存修改",
  );

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
});
