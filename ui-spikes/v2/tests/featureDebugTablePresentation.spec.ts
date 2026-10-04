import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("table presentation feature debug hot-applies persists guards invalid config and restores exact baseline", async ({ page, request }) => {
  ensureFeatureDebugCopy();

  const baselineConfigResponse = await request.get(
    "/__workspace/table-presentation",
  );
  expect(baselineConfigResponse.ok()).toBeTruthy();
  const baselineConfig = await baselineConfigResponse.json() as {
    exists: boolean;
    source?: string | null;
  };

  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const target = catalog.chapters.find(
    (chapter) => chapter.ready && chapter.name.includes("副本"),
  );
  expect(target).toBeTruthy();

  const baselineChapter = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{
        workingText: string;
        sidecar: Record<string, unknown>;
        revision: string;
      }>,
    );

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();
  const action = page.locator("#ui-debug-table-config");
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
    "配置功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "5/5 通过",
    { timeout: 30_000 },
  );

  await expect(page.locator("#source-location-status")).toContainText(
    "原项目配置精确恢复",
  );
  await expect(page.locator("#editor-tab-table-config")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();

  const currentConfig = await request
    .get("/__workspace/table-presentation")
    .then((response) =>
      response.json() as Promise<{
        exists: boolean;
        source?: string | null;
      }>,
    );
  expect(currentConfig.exists).toBe(baselineConfig.exists);
  expect(currentConfig.source ?? null).toBe(baselineConfig.source ?? null);

  const currentChapter = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{
        workingText: string;
        sidecar: Record<string, unknown>;
        revision: string;
      }>,
    );
  expect(currentChapter.workingText).toBe(baselineChapter.workingText);
  expect(currentChapter.sidecar).toEqual(baselineChapter.sidecar);
  expect(currentChapter.revision).toBe(baselineChapter.revision);

  await expect(action).toBeDisabled();
});
