import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("feature debug Undo/Redo runs real product history and restores persisted baseline", async ({ page, request }) => {
  ensureFeatureDebugCopy();
  const catalogResponse = await request.get("/__workspace/chapters");
  const catalog = await catalogResponse.json() as {
    chapters: Array<{ id: string; name: string; ready: boolean }>;
  };
  const target = catalog.chapters.find(
    (chapter) => chapter.ready && chapter.name.includes("副本"),
  ) ?? catalog.chapters.find((chapter) => chapter.ready);
  expect(target).toBeTruthy();

  const baselineResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(target!.id)}`,
  );
  const baseline = await baselineResponse.json() as {
    workingText: string;
    revision: string;
  };

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
  await expect(page.locator("#state-value")).toHaveText("idle");

  await page.locator("#ui-debug-toggle").click();
  const initialize = page.locator("#ui-debug-initialize");
  const action = page.locator("#ui-debug-undo-redo");
  await expect(action).toBeDisabled();
  await initialize.click();

  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "true",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#chapter-path")).toContainText("副本");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();

  await page.locator("#ui-debug-toggle").click();
  await expect(action).toBeEnabled();
  await action.click();

  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "撤销 / 重做功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "8/8 通过",
    { timeout: 15_000 },
  );

  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#source-location-status")).toContainText(
    "已恢复原始状态 · 未写入磁盘",
  );

  const currentResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(target!.id)}`,
  );
  const current = await currentResponse.json() as {
    workingText: string;
    revision: string;
  };
  expect(current.workingText).toBe(baseline.workingText);
  expect(current.revision).toBe(baseline.revision);

  await expect(action).toBeDisabled();
});
