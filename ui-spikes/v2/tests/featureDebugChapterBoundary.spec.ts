import { closeChapter } from "./productActions";
import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test.describe.configure({ timeout: 70_000 });

test("chapter boundary feature debug assigns saves reenters and restores baseline without exporting chapters", async ({ page, request }) => {
  ensureFeatureDebugCopy();

  await page.goto("/");

  const navigation = page.locator("#chapter-select");
  await navigation.selectOption("__node_ocr__");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-review-module")).toHaveText("章节定界");

  const baselineStatus = await page.locator("#boundary-status").textContent();
  const baselineRows = await page.locator("#active-module-rows").textContent();
  expect(Number(baselineRows)).toBeGreaterThan(0);

  const baselineFiles = await page
    .locator("#calibration-grid input.chapter-file-input:not(:disabled)")
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );

  await closeChapter(page);
  await expect(page.locator("#state-value")).toHaveText("idle");

  const baselineBoundary = await request
    .get("/__workspace/boundary")
    .then((response) =>
      response.json() as Promise<{
        workingText: string;
        baselineText: string;
        sidecar: Record<string, unknown>;
        revision: string;
      }>,
    );
  const baselineCatalog = await request
    .get("/__workspace/chapters")
    .then((response) =>
      response.json() as Promise<{
        chapters: Array<{ name: string }>;
      }>,
    );
  const baselineCatalogNames = baselineCatalog.chapters.map(
    (chapter) => chapter.name,
  );

  await page.locator("#ui-debug-toggle").click();
  const action = page.locator("#ui-debug-chapter-boundary");
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
    "章节定界模块功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "5/5 通过",
    { timeout: 45_000 },
  );

  await expect(page.locator("#source-location-status")).toContainText(
    "未执行真实导出",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-review-module")).toHaveText("章节定界");
  await expect(page.locator("#active-module-rows")).toHaveText(
    baselineRows ?? "",
  );
  await expect(page.locator("#boundary-status")).toHaveText(
    baselineStatus ?? "",
  );
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();

  const finalFiles = await page
    .locator("#calibration-grid input.chapter-file-input:not(:disabled)")
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
  expect(finalFiles).toEqual(baselineFiles);

  const currentBoundary = await request
    .get("/__workspace/boundary")
    .then((response) =>
      response.json() as Promise<{
        workingText: string;
        baselineText: string;
        sidecar: Record<string, unknown>;
        revision: string;
      }>,
    );

  expect(currentBoundary.workingText).toBe(baselineBoundary.workingText);
  expect(currentBoundary.baselineText).toBe(baselineBoundary.baselineText);
  expect(currentBoundary.sidecar).toEqual(baselineBoundary.sidecar);
  expect(currentBoundary.revision).toBe(baselineBoundary.revision);

  const currentCatalog = await request
    .get("/__workspace/chapters")
    .then((response) =>
      response.json() as Promise<{
        chapters: Array<{ name: string }>;
      }>,
    );
  expect(currentCatalog.chapters.map((chapter) => chapter.name)).toEqual(
    baselineCatalogNames,
  );
  expect(
    currentCatalog.chapters.some((chapter) => /^990[1-9]\s/.test(chapter.name)),
  ).toBe(false);

  await expect(action).toBeDisabled();
});
