import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("source preview sync feature debug runs the real bidirectional scroll path", async ({ page, request }) => {
  ensureFeatureDebugCopy();

  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const target = catalog.chapters.find(
    (chapter) => chapter.ready && chapter.name.includes("副本"),
  );
  expect(target).toBeTruthy();

  const baseline = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{ workingText: string; revision: string }>,
    );

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();

  const action = page.locator("#ui-debug-source-preview-sync");
  await expect(action).toBeDisabled();

  await page.locator("#ui-debug-initialize").click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "true",
  );

  await page.locator("#ui-debug-toggle").click();
  await expect(action).toBeEnabled();
  await action.click();

  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "源码 / 预览联动功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "4/4 通过",
    { timeout: 12_000 },
  );
  await expect(page.locator("#source-location-status")).toContainText(
    "源码 / 预览联动功能调试通过",
  );

  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();

  const current = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{ workingText: string; revision: string }>,
    );
  expect(current.workingText).toBe(baseline.workingText);
  expect(current.revision).toBe(baseline.revision);

  await expect(action).toBeDisabled();
});
