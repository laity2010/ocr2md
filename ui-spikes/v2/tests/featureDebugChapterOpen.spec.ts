import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test.describe.configure({ timeout: 60_000 });

test("chapter selection feature debug covers ready blocked multi-chapter open and zero-write return", async ({ page, request }) => {
  ensureFeatureDebugCopy();

  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      projectName: string;
      chapters: Array<{
        id: string;
        name: string;
        ready: boolean;
        reason?: string;
      }>;
    }>,
  );

  const safe = catalog.chapters.find(
    (chapter) => chapter.ready && chapter.name.includes("副本"),
  );
  expect(safe).toBeTruthy();

  const targets = catalog.chapters
    .filter((chapter) => chapter.ready && chapter.id !== safe!.id)
    .slice(0, 2);
  const blocked = catalog.chapters.filter((chapter) => !chapter.ready);
  expect(targets).toHaveLength(2);
  expect(blocked.length).toBeGreaterThanOrEqual(1);

  const baseline = new Map<string, {
    workingText: string;
    sidecar: Record<string, unknown>;
    revision: string;
  }>();

  for (const chapter of [safe!, ...targets]) {
    const raw = await request
      .get("/__workspace/chapter?chapterId=" + encodeURIComponent(chapter.id))
      .then((response) =>
        response.json() as Promise<{
          workingText: string;
          sidecar: Record<string, unknown>;
          revision: string;
        }>,
      );
    baseline.set(chapter.id, raw);
  }

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();

  const action = page.locator("#ui-debug-chapter-open");
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
    "章节选择 / 打开章节功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "5/5 通过",
    { timeout: 30_000 },
  );

  await expect(page.locator("#source-location-status")).toContainText(
    "全程零写入",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-review-module")).toHaveText("章节标题");
  await expect(page.locator("#active-module-rows")).toHaveText("10");
  await expect(page.locator("#chapter-select")).toHaveValue(safe!.id);
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();

  for (const chapter of blocked) {
    await expect(
      page.locator("#chapter-select option").filter({
        hasText: "chapters/" + chapter.name,
      }),
    ).toBeDisabled();
  }

  for (const chapter of [safe!, ...targets]) {
    const current = await request
      .get("/__workspace/chapter?chapterId=" + encodeURIComponent(chapter.id))
      .then((response) =>
        response.json() as Promise<{
          workingText: string;
          sidecar: Record<string, unknown>;
          revision: string;
        }>,
      );
    const original = baseline.get(chapter.id)!;
    expect(current.workingText).toBe(original.workingText);
    expect(current.sidecar).toEqual(original.sidecar);
    expect(current.revision).toBe(original.revision);
  }

  await expect(action).toBeDisabled();
});
