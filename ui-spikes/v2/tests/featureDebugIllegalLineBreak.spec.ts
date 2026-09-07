import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("illegal line-break feature debug covers table semantics undo redo save reentry and restores baseline", async ({ page, request }) => {
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

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();

  const action = page.locator("#ui-debug-illegal-line-break");
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
    "非法断行模块功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "5/5 通过",
    { timeout: 22_000 },
  );

  await expect(page.locator("#source-location-status")).toContainText(
    "安全恢复原 6 条",
  );
  await expect(page.locator("#active-review-module")).toHaveText("非法断行");
  await expect(page.locator("#active-module-rows")).toHaveText("6");
  await expect(page.locator("#illegal-export-status")).toHaveText(
    "导出效果：6 条“合并”标定 → 6 组断行合并 · 已忽略 3 条",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();

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
