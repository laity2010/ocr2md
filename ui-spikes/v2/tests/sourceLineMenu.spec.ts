import { expect, test } from "@playwright/test";

test("active source line number menu adds the line to the active review table", async ({ page }) => {
  await page.goto("/");
  await page.locator("#chapter-select").selectOption({
    label: "chapters/01 Buffett’s Alpha",
  });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  await page.locator("#chapter-element-tab").click();
  await page.locator('#chapter-element-menu [data-review-module="嵌入块"]').click();
  await expect(page.locator("#active-review-module")).toHaveText("嵌入块");

  const beforeRows = Number(await page.locator("#active-module-rows").textContent());
  const beforeUndo = Number(await page.locator("#undo-depth").textContent());
  await page.locator('[data-review-module="变动行"]').click();
  const beforeChanged = Number(
    await page.locator("#active-module-rows").textContent(),
  );
  await page.locator("#chapter-element-tab").click();
  await page.locator('#chapter-element-menu [data-review-module="嵌入块"]').click();

  const titleLine = page.locator("#working-editor .cm-line", {
    hasText: "# Buffett’s Alpha",
  }).first();
  await expect(titleLine).toBeVisible();
  await titleLine.click({ position: { x: 12, y: 10 } });

  const activeLineNumber = page.locator(
    "#working-editor .cm-lineNumbers .cm-gutterElement.cm-activeLineGutter",
  );
  await expect(activeLineNumber).toBeVisible();
  await activeLineNumber.click();

  const menu = page.locator("#source-line-menu");
  await expect(menu).toBeVisible();
  await expect(page.locator("#source-line-menu-title")).toContainText(
    "当前数据表：嵌入块",
  );
  await expect(page.locator("#source-line-add-active")).toHaveText(
    "加入「嵌入块」数据表",
  );

  await page.locator("#source-line-add-active").click();

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#undo-depth")).toHaveText(String(beforeUndo + 1));
  await expect(page.locator("#active-module-rows")).toHaveText(
    String(beforeRows + 1),
  );
  await expect(page.locator("#editor-mode-status")).toContainText(
    "已加入「嵌入块」",
  );
  await expect(
    page.locator(
      '#calibration-grid .ag-grid-pinned-left-cells [col-id="sourceLine"]',
    ).first(),
  ).toBeVisible();
  await expect(
    page.locator('#calibration-grid .ag-row', { hasText: "# Buffett’s Alpha" }).first(),
  ).toBeVisible();

  await page.locator('[data-review-module="变动行"]').click();
  await expect(page.locator("#active-module-rows")).toHaveText(
    String(beforeChanged + 1),
  );
  await expect(page.locator("#calibration-grid")).toContainText("嵌入块");
  await expect(page.locator("#calibration-grid")).not.toContainText(
    "标定性质 →",
  );

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-module-rows")).toHaveText(String(beforeChanged));
});

test("active source line number menu deletes the whole line through working history", async ({ page }) => {
  await page.goto("/");
  await page.locator("#chapter-select").selectOption({
    label: "chapters/01 Buffett’s Alpha",
  });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const targetText = "# Buffett’s Alpha";
  const beforeUndo = Number(await page.locator("#undo-depth").textContent());
  await page.locator('[data-review-module="变动行"]').click();
  const beforeChanged = Number(
    await page.locator("#active-module-rows").textContent(),
  );
  await page.locator("#chapter-element-tab").click();
  await page.locator('#chapter-element-menu [data-review-module="章节标题"]').click();

  const targetLine = page.locator("#working-editor .cm-line", {
    hasText: targetText,
  }).first();
  await expect(targetLine).toBeVisible();
  await targetLine.click({ position: { x: 12, y: 10 } });

  const activeLineNumber = page.locator(
    "#working-editor .cm-lineNumbers .cm-gutterElement.cm-activeLineGutter",
  );
  await expect(activeLineNumber).toBeVisible();
  const deletedLineNumber = (await activeLineNumber.textContent())?.trim() ?? "";
  await activeLineNumber.click();

  const menu = page.locator("#source-line-menu");
  await expect(menu).toBeVisible();
  await expect(page.locator("#source-line-delete")).toHaveText("删除该行");
  await page.locator("#source-line-delete").click();

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#undo-depth")).toHaveText(String(beforeUndo + 1));
  await expect(page.locator("#editor-mode-status")).toContainText("已删除第");
  await expect(
    page.locator("#working-editor .cm-line", { hasText: targetText }),
  ).toHaveCount(0);
  await expect(page.locator("#working-editor .cm-content")).toBeFocused();
  await expect(
    page.locator(
      "#working-editor .cm-lineNumbers .cm-gutterElement.cm-activeLineGutter",
    ),
  ).toHaveText(deletedLineNumber);

  await page.locator('[data-review-module="变动行"]').click();
  await expect(page.locator("#active-module-rows")).toHaveText(
    String(beforeChanged + 1),
  );
  await expect(page.locator("#calibration-grid")).toContainText("删除");

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(
    page.locator("#working-editor .cm-line", { hasText: targetText }).first(),
  ).toBeVisible();
});

test("active source line number menu inserts one br at the end of the line", async ({ page }) => {
  await page.goto("/");
  await page.locator("#chapter-select").selectOption({
    label: "chapters/01 Buffett’s Alpha",
  });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const targetText = "# Buffett’s Alpha";
  const beforeUndo = Number(await page.locator("#undo-depth").textContent());
  const targetLine = page.locator("#working-editor .cm-line", {
    hasText: targetText,
  }).first();
  await expect(targetLine).toBeVisible();
  await targetLine.click({ position: { x: 12, y: 10 } });

  const activeLineNumber = page.locator(
    "#working-editor .cm-lineNumbers .cm-gutterElement.cm-activeLineGutter",
  );
  const sourceLine = (await activeLineNumber.textContent())?.trim() ?? "";
  await activeLineNumber.click();

  await expect(page.locator("#source-line-insert-br")).toHaveText("插入<br>");
  await page.locator("#source-line-insert-br").click();

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#undo-depth")).toHaveText(String(beforeUndo + 1));
  await expect(page.locator("#editor-mode-status")).toContainText("行末插入 <br>");
  await expect(page.locator("#working-editor .cm-content")).toBeFocused();
  await expect(activeLineNumber).toHaveText(sourceLine);
  await expect.poll(async () => (await targetLine.textContent()) ?? "").toContain(
    targetText + "<br>",
  );

  await activeLineNumber.click();
  await page.locator("#source-line-insert-br").click();
  await expect(page.locator("#undo-depth")).toHaveText(String(beforeUndo + 1));
  await expect(page.locator("#editor-mode-status")).toContainText("行末已有 <br>");
  await expect.poll(async () => (await targetLine.textContent()) ?? "").toContain(
    targetText + "<br>",
  );

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect.poll(async () => (await targetLine.textContent()) ?? "").not.toContain("<br>");
});
