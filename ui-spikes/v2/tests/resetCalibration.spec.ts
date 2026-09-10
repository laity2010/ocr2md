import { expect, test } from "@playwright/test";

test("reset calibration requires confirmation and restores the current chapter to original", async ({ page, request }) => {
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const chapter = catalog.chapters.find(
    (item) => item.ready && item.name === "01 Buffett’s Alpha",
  ) ?? catalog.chapters.find((item) => item.ready);
  expect(chapter).toBeTruthy();

  const before = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter!.id)}`,
  ).then((response) => response.json() as Promise<{
    originalText: string;
    workingText: string;
    sidecar: unknown;
    revision: string;
  }>);
  expect(before.workingText).not.toBe(before.originalText);

  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  await expect(page.locator("#reset-calibration")).toBeDisabled();

  await page.locator("#chapter-select").selectOption(chapter!.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#reset-calibration")).toBeEnabled();
  const resetBox = await page.locator("#reset-calibration").boundingBox();
  const viewport = page.viewportSize();
  expect(resetBox).toBeTruthy();
  expect(viewport).toBeTruthy();
  expect(resetBox!.x + resetBox!.width).toBeLessThanOrEqual(viewport!.width);

  const editor = page.locator("#working-editor .cm-content");
  await editor.click();
  await page.keyboard.type("RESET_ME");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  const dirtyLength = Number(await page.locator("#working-length").textContent());
  expect(dirtyLength).toBe(before.workingText.length + "RESET_ME".length);

  await page.locator("#reset-calibration").click();
  await expect(page.locator("#reset-confirm-overlay")).toBeVisible();
  await expect(page.locator("#reset-confirm-message")).toContainText(chapter!.name);
  await expect(page.locator("#reset-confirm-message")).toContainText("立即保存");

  await page.locator("#reset-cancel").click();
  await expect(page.locator("#reset-confirm-overlay")).toBeHidden();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(String(dirtyLength));

  await page.locator("#reset-calibration").click();
  await page.locator("#reset-confirm").click();
  await expect(page.locator("#reset-confirm-overlay")).toBeHidden();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#working-length")).toHaveText(String(before.originalText.length));
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#reset-calibration")).toBeEnabled();

  const after = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter!.id)}`,
  ).then((response) => response.json() as Promise<{
    originalText: string;
    workingText: string;
    sidecar: unknown;
    revision: string;
  }>);
  expect(after.workingText).toBe(after.originalText);
  expect(after.workingText).toBe(before.originalText);
  expect(after.revision).not.toBe(before.revision);
  expect(JSON.stringify(after.sidecar)).not.toContain('"isWorkingCorrection":true');

  await page.reload();
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#chapter-select").selectOption(chapter!.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#working-length")).toHaveText(String(before.originalText.length));
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");

  const cleanRevision = (await page.locator("#revision").textContent())?.trim();
  await page.locator("#reset-calibration").click();
  await expect(page.locator("#reset-confirm-overlay")).toBeVisible();
  await page.locator("#reset-confirm").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#working-length")).toHaveText(String(before.originalText.length));
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  const resetAgainRevision = (await page.locator("#revision").textContent())?.trim();
  expect(resetAgainRevision).toBeTruthy();
  expect(resetAgainRevision).not.toBe(cleanRevision);

  const finalPayload = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter!.id)}`,
  ).then((response) => response.json() as Promise<{ revision: string }>);
  const restoreResponse = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapter!.id,
      expectedRevision: finalPayload.revision,
      workingText: before.workingText,
      sidecar: before.sidecar,
    },
  });
  expect(restoreResponse.ok()).toBeTruthy();
});
