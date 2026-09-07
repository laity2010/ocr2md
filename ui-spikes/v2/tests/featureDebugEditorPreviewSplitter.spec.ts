import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("editor preview splitter feature debug uses real product path and restores baseline", async ({ page, request }) => {
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
  await page.locator("#ui-debug-initialize").click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "true",
  );

  await page.evaluate(() => {
    const splitter = document.querySelector("#editor-preview-splitter");
    if (!splitter) throw new Error("editor preview splitter missing");
    const values: string[] = [];
    (window as typeof window & { __editorPreviewDebugValues?: string[] })
      .__editorPreviewDebugValues = values;
    new MutationObserver(() => {
      values.push(splitter.getAttribute("aria-valuenow") ?? "");
    }).observe(splitter, { attributes: true, attributeFilter: ["aria-valuenow"] });
  });

  await page.locator("#ui-debug-toggle").click();
  const action = page.locator("#ui-debug-editor-preview-splitter");
  await expect(action).toBeEnabled();
  await action.click();

  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "源码 / 预览水平分割条功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "4/4 通过",
    { timeout: 10_000 },
  );

  const values = await page.evaluate(
    () =>
      (window as typeof window & { __editorPreviewDebugValues?: string[] })
        .__editorPreviewDebugValues ?? [],
  );
  expect(values).toContain("47");
  expect(values).toContain("39");
  expect(values.at(-1)).toBe("55");

  await expect(page.locator("#editor-preview-splitter")).toHaveAttribute(
    "aria-valuenow",
    "55",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#source-location-status")).toContainText(
    "55% → 47% → 39% → 55%",
  );

  const stored = await page.evaluate(() =>
    localStorage.getItem("ocr2md-v2-editor-preview-split-v1"),
  );
  expect(stored).toBe("55");

  const current = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{ workingText: string; revision: string }>,
    );
  expect(current.workingText).toBe(baseline.workingText);
  expect(current.revision).toBe(baseline.revision);

  await expect(action).toBeDisabled();
});
