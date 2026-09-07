import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

test("catalog selects multiple real project chapters and persistence survives reload", async ({ page, request }) => {
  const catalogResponse = await request.get("/__workspace/chapters");
  const catalog = await catalogResponse.json() as {
    projectName: string;
    chapters: Array<{ id: string; name: string; ready: boolean }>;
  };
  const chapterB = catalog.chapters.find((item) => item.name === "02 Appendix A")!;
  const chapterBResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapterB.id)}`,
  );
  const chapterBPayload = await chapterBResponse.json() as { workingText: string };
  const chapterBLength = chapterBPayload.workingText.length;

  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");

  await expect(page.locator("#project-name")).toHaveText(catalog.projectName);
  await expect(page.locator(".workspace-tab")).toHaveCount(0);
  await expect(page.locator("#chapter-select")).toHaveAttribute("aria-label", "项目导航");
  await expect(page.locator("#chapter-select option")).toHaveCount(
    catalog.chapters.length + 4,
  );
  await expect(page.locator("#chapter-select option", { hasText: "ocr" })).toBeEnabled();
  await expect(page.locator("#chapter-select option", { hasText: "chapters" }).first()).toBeDisabled();
  await expect(page.locator("#chapter-select option", { hasText: "trans · 待规划" })).toBeDisabled();
  await expect(page.locator("#chapter-select option", { hasText: "00 Incomplete" })).toBeDisabled();
  const readyCount = catalog.chapters.filter((chapter) => chapter.ready).length;
  await expect(page.locator("#chapter-selection-status")).toContainText(
    "工作目录 · " + catalog.projectName
      + " · chapters " + readyCount + "/" + catalog.chapters.length,
  );
  await expect(page.locator("#open-chapter")).not.toBeVisible();
  await expect(page.locator("#open-boundary")).not.toBeVisible();
  await expect(page.locator("nav .project-actions")).toHaveAttribute(
    "aria-label",
    "工作目录操作",
  );
  await expect(page.locator("nav .project-actions #undo")).toHaveCount(1);
  await expect(page.locator("nav .project-actions #redo")).toHaveCount(1);
  await expect(page.locator("nav .project-actions #save")).toHaveCount(1);
  await expect(page.locator(".grid-pane .pane-menu #undo")).toHaveCount(0);
  await expect(page.locator(".grid-pane .pane-menu #redo")).toHaveCount(0);
  await expect(page.locator(".grid-pane .pane-menu #save")).toHaveCount(0);

  await page.locator("#chapter-select").selectOption("__node_ocr__");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#chapter-select option:checked")).toHaveText("ocr");
  await expect(page.locator('[data-review-module="章节定界"]')).toBeVisible();
  await expect(page.locator('[data-review-module="章节标题"]')).toBeHidden();
  await expect(page.locator('[data-review-module="注释"]')).toBeHidden();
  await expect(page.locator('[data-review-module="嵌入块"]')).toBeHidden();
  await expect(page.locator('[data-review-module="非法断行"]')).toBeHidden();

  await page.locator("#chapter-select").selectOption({ label: "chapters/01 Buffett’s Alpha" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#chapter-select option:checked")).toHaveText(
    "chapters/01 Buffett’s Alpha",
  );
  await expect(page.locator('[data-review-module="章节定界"]')).toBeHidden();
  await expect(page.locator('[data-review-module="章节标题"]')).toBeVisible();
  await expect(page.locator('[data-review-module="注释"]')).toBeVisible();
  await expect(page.locator('[data-review-module="嵌入块"]')).toBeVisible();
  await expect(page.locator('[data-review-module="非法断行"]')).toBeVisible();
  await expect(page.locator(".grid-pane .pane-status #review-grid-status")).toContainText(
    "章节标题",
  );
  await expect(page.locator(".grid-pane .pane-status #title-export-status")).toBeVisible();
  await expect(page.locator("#heading-toolbar #title-export-status")).toHaveCount(0);
  await expect(page.locator("#review-grid-status.pane-message")).toHaveCount(0);

  await page.locator('[data-review-module="非法断行"]').click();
  await expect(page.locator(".grid-pane .pane-status #review-grid-status")).toContainText(
    "非法断行",
  );
  await expect(page.locator(".grid-pane .pane-status #illegal-export-status")).toBeVisible();
  await expect(page.locator(".grid-pane .pane-status #title-export-status")).toBeHidden();
  await page.locator('[data-review-module="章节标题"]').click();
  await expect(page.locator(".grid-pane .pane-status #review-grid-status")).toContainText(
    "章节标题",
  );

  await expect(page.locator("#chapter-path")).toContainText(
    "project://" + catalog.projectName + "/chapters/01 Buffett’s Alpha/",
  );
  await expect(page.locator("#chapter-name")).toHaveText("01 Buffett’s Alpha.md");
  await expect(page.locator("#calibration-rows")).toHaveText("205");
  await expect(page.locator("#annotation-pairs")).toHaveText("10");

  const editor = page.locator("#working-editor .cm-content");
  await expect(editor).toContainText("ocr2md_chapter_split: true");
  await expect(editor).toHaveAttribute("contenteditable", "true");

  const baselineLength = Number(await page.locator("#working-length").textContent());
  expect(baselineLength).toBeGreaterThan(60_000);
  const baselineRevision = (await page.locator("#revision").textContent())?.trim();
  expect(baselineRevision).toBeTruthy();
  expect(baselineRevision).not.toBe("—");

  await editor.click();
  await page.keyboard.type("X");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await expect(page.locator("#save")).toBeEnabled();

  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#last-saved-at")).not.toHaveText("—");

  const savedRevision = (await page.locator("#revision").textContent())?.trim();
  expect(savedRevision).toBeTruthy();
  expect(savedRevision).not.toBe(baselineRevision);

  await page.reload();
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#chapter-select").selectOption({ label: "chapters/01 Buffett’s Alpha" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await expect(page.locator("#revision")).toHaveText(savedRevision!);

  await page.locator("#close").click();
  await expect(page.locator("#state-value")).toHaveText("idle");

  await page.locator("#chapter-select").selectOption({ label: "chapters/02 Appendix A" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#chapter-name")).toHaveText("02 Appendix A.md");
  await expect(page.locator("#working-length")).toHaveText(String(chapterBLength));
});

test("internal debug session has no editable chapter and cannot save", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");

  // The legacy machine debug session is engineering-only now; the visible
  // “功能调试” menu is a separate product acceptance tool.
  await page.locator("#enter-debug").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#state-value")).toHaveText("debug");
  await expect(page.locator("#can-edit")).toHaveText("否");
  await expect(page.locator("#can-save")).toHaveText("否");
  await expect(page.locator("#working-editor .cm-content")).toHaveAttribute("contenteditable", "false");
  await expect(page.locator("#save")).toBeDisabled();

  await page.locator("#exit-debug").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#state-value")).toHaveText("idle");
});
