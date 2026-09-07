import { expect, test, type APIRequestContext } from "@playwright/test";

async function chapterByName(request: APIRequestContext, name: string) {
  const response = await request.get("/__workspace/chapters");
  const payload = await response.json() as {
    chapters: Array<{ id: string; name: string; ready: boolean }>;
  };
  return payload.chapters.find((chapter) => chapter.name === name)!;
}

async function workspace(
  request: APIRequestContext,
  chapterId: string,
): Promise<{
  workingText: string;
  sidecar: Record<string, unknown>;
  revision: string;
}> {
  const response = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapterId)}`,
  );
  expect(response.ok()).toBe(true);
  return response.json();
}

test("dirty close offers cancel, discard, and save-before-close", async ({ page, request }) => {
  const chapter = await chapterByName(request, "01 Buffett’s Alpha");
  const baseline = await workspace(request, chapter.id);

  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#chapter-select").selectOption(chapter.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const baselineLength = baseline.workingText.length;
  const editor = page.locator("#working-editor .cm-content");

  // Cancel: keep dirty state and local edit.
  await editor.click();
  await page.keyboard.type("C");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await page.locator("#close").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-leave-confirm");
  await expect(page.locator("#leave-confirm-overlay")).toBeVisible();
  await expect(page.locator("#leave-confirm-message")).toContainText("关闭当前章节");
  await expect(page.locator("#leave-cancel")).toBeEnabled();
  await expect(page.locator("#leave-discard")).toBeEnabled();
  await expect(page.locator("#leave-save")).toBeEnabled();

  await page.locator("#leave-cancel").click();
  await expect(page.locator("#leave-confirm-overlay")).toBeHidden();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));

  // Discard: close without persisting C.
  await page.locator("#close").click();
  await page.locator("#leave-discard").click();
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#open-chapter").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength));

  // Save: persist S before closing.
  await editor.click();
  await page.keyboard.type("S");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await page.locator("#close").click();
  await page.locator("#leave-save").click();
  await expect(page.locator("#state-value")).toHaveText("idle");

  await page.locator("#open-chapter").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await page.locator("#close").click();

  // Restore isolated test workspace baseline.
  const current = await workspace(request, chapter.id);
  const restore = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapter.id,
      expectedRevision: current.revision,
      workingText: baseline.workingText,
      sidecar: baseline.sidecar,
    },
  });
  expect(restore.ok()).toBe(true);
  const restored = await restore.json() as { revision: string };
  expect(restored.revision).toBe(baseline.revision);
});

test("dirty chapter switch uses the same leave protection", async ({ page, request }) => {
  const chapterA = await chapterByName(request, "01 Buffett’s Alpha");
  const chapterB = await chapterByName(request, "02 Appendix A");
  const baselineA = await workspace(request, chapterA.id);

  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#chapter-select").selectOption(chapterA.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const editor = page.locator("#working-editor .cm-content");
  await editor.click();
  await page.keyboard.type("D");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");

  await page.locator("#chapter-select").selectOption(chapterB.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-leave-confirm");
  await expect(page.locator("#leave-confirm-message")).toContainText("02 Appendix A");

  // Cancel restores the current chapter selection and keeps the dirty draft.
  await page.locator("#leave-cancel").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#chapter-select")).toHaveValue(chapterA.id);
  await expect(page.locator("#working-length")).toHaveText(
    String(baselineA.workingText.length + 1),
  );

  // Discard switches to B and leaves A untouched on disk.
  await page.locator("#chapter-select").selectOption(chapterB.id);
  await page.locator("#leave-discard").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#chapter-name")).toHaveText("02 Appendix A.md");

  await page.locator("#close").click();
  await page.locator("#chapter-select").selectOption(chapterA.id);
  await expect(page.locator("#working-length")).toHaveText(
    String(baselineA.workingText.length),
  );

  // Save-before-switch uses the same prompt but persists A first.
  await editor.click();
  await page.keyboard.type("W");
  await page.locator("#chapter-select").selectOption(chapterB.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-leave-confirm");
  await page.locator("#leave-save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#chapter-name")).toHaveText("02 Appendix A.md");

  await page.locator("#close").click();
  await page.locator("#chapter-select").selectOption(chapterA.id);
  await expect(page.locator("#working-length")).toHaveText(
    String(baselineA.workingText.length + 1),
  );
  await page.locator("#close").click();

  const currentA = await workspace(request, chapterA.id);
  const restore = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapterA.id,
      expectedRevision: currentA.revision,
      workingText: baselineA.workingText,
      sidecar: baselineA.sidecar,
    },
  });
  expect(restore.ok()).toBe(true);
  const restored = await restore.json() as { revision: string };
  expect(restored.revision).toBe(baselineA.revision);
});
