import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("save/reload feature debug persists calibration, reloads it, then restores exact baseline", async ({ page, request }) => {
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
      response.json() as Promise<{
        workingText: string;
        sidecar: Record<string, unknown>;
        revision: string;
      }>,
    );

  const saveRevisions: string[] = [];
  page.on("response", async (response) => {
    if (
      response.request().method() !== "POST"
      || !response.url().includes("/__workspace/chapter")
    ) return;
    try {
      const payload = await response.json() as { revision?: string };
      if (payload.revision) saveRevisions.push(payload.revision);
    } catch {
      // Non-JSON failure responses are asserted by the feature debug itself.
    }
  });

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();

  const action = page.locator("#ui-debug-save-reload");
  await expect(action).toBeDisabled();
  await page.locator("#ui-debug-initialize").click();

  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "true",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#save")).toBeDisabled();

  const firstRow = page.locator(
    '#calibration-grid [role="row"]:has(select.calibration-line-type)',
  ).first();
  const targetPreview = (
    await firstRow.locator(".chapter-heading-preview").textContent()
  )?.trim();
  const baselineLineType = await firstRow
    .locator("select.calibration-line-type")
    .inputValue();
  expect(targetPreview).toBeTruthy();
  expect(baselineLineType).toMatch(/^[1-6] 级标题$/);

  await page.locator("#ui-debug-toggle").click();
  await expect(action).toBeEnabled();
  await action.click();

  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "保存标定 / 重入加载功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "5/5 通过",
    { timeout: 20_000 },
  );

  expect(saveRevisions.length).toBeGreaterThanOrEqual(3);
  expect(saveRevisions.some((revision) => revision !== baseline.revision)).toBe(
    true,
  );
  expect(saveRevisions.at(-1)).toBe(baseline.revision);

  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#source-location-status")).toContainText(
    "保存标定 / 重入加载功能调试通过",
  );

  const restoredRow = page.locator(
    '#calibration-grid [role="row"]:has(.chapter-heading-preview)',
  ).filter({ hasText: targetPreview! }).first();
  await expect(restoredRow.locator("select.calibration-line-type")).toHaveValue(
    baselineLineType,
  );

  const current = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{
        workingText: string;
        sidecar: Record<string, unknown>;
        revision: string;
      }>,
    );

  expect(current.workingText).toBe(baseline.workingText);
  expect(current.sidecar).toEqual(baseline.sidecar);
  expect(current.revision).toBe(baseline.revision);
  await expect(action).toBeDisabled();
});
