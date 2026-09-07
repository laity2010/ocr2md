import { expect, test, type APIRequestContext } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

async function chapterFixture(request: APIRequestContext) {
  const catalogResponse = await request.get("/__workspace/chapters");
  const catalog = await catalogResponse.json() as {
    chapters: Array<{ id: string; name: string; ready: boolean }>;
  };
  const chapter = catalog.chapters.find(
    (item) => item.name === "01 Buffett’s Alpha",
  )!;
  const baselineResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter.id)}`,
  );
  const baseline = await baselineResponse.json() as {
    workingText: string;
    sidecar: Record<string, unknown>;
    revision: string;
  };
  return { chapter, baseline };
}

async function restoreBaseline(
  request: APIRequestContext,
  chapterId: string,
  baseline: { workingText: string; sidecar: Record<string, unknown>; revision: string },
) {
  const currentResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapterId)}`,
  );
  const current = await currentResponse.json() as { revision: string };
  const restore = await request.post("/__workspace/chapter", {
    data: {
      chapterId,
      expectedRevision: current.revision,
      workingText: baseline.workingText,
      sidecar: baseline.sidecar,
    },
  });
  expect(restore.ok()).toBe(true);
  const restored = await restore.json() as { revision: string };
  expect(restored.revision).toBe(baseline.revision);
}

test("embed ignore participates in unified undo/redo and survives save reentry", async ({ page, request }) => {
  const { chapter, baseline } = await chapterFixture(request);

  await page.goto("/");
  await page.locator("#chapter-select").selectOption(chapter.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator('[data-review-module="嵌入块"]').click();

  await expect(page.locator("#active-module-rows")).toHaveText("51");
  await expect(page.locator("#embed-group-status")).toHaveText(
    "总计 65 · 可见 51 · 组 11 · 未分组 0",
  );
  const firstRow = page.locator("#calibration-grid .ag-row").first();
  await expect(firstRow.locator('[col-id="embedNumber"]')).toHaveText("1");
  const firstLineType = firstRow.locator("select.calibration-line-type");
  await expect(firstLineType).toHaveValue("嵌入块首");

  await firstLineType.selectOption("已忽略");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#active-module-rows")).toHaveText("50");
  await expect(page.locator("#embed-group-status")).toHaveText(
    "总计 65 · 可见 50 · 组 11 · 未分组 0",
  );
  await expect(page.locator("#undo-depth")).toHaveText("1");
  await expect(page.locator("#redo-depth")).toHaveText("0");

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-module-rows")).toHaveText("51");
  await expect(page.locator("#embed-group-status")).toHaveText(
    "总计 65 · 可见 51 · 组 11 · 未分组 0",
  );
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("1");

  await page.locator("#redo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#active-module-rows")).toHaveText("50");
  await expect(page.locator("#embed-group-status")).toHaveText(
    "总计 65 · 可见 50 · 组 11 · 未分组 0",
  );

  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator("#close").click();
  await page.locator("#open-chapter").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator('[data-review-module="嵌入块"]').click();

  await expect(page.locator("#active-module-rows")).toHaveText("50");
  await expect(page.locator("#embed-group-status")).toHaveText(
    "总计 65 · 可见 50 · 组 11 · 未分组 0",
  );

  await page.locator("#close").click();
  await restoreBaseline(request, chapter.id, baseline);
});
