import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

async function scrollGridHorizontally(page: Page, side: "left" | "right") {
  await page.locator("#calibration-grid .ag-body-horizontal-scroll-viewport").evaluate(
    (element, targetSide) => {
      element.scrollLeft = targetSide === "right" ? element.scrollWidth : 0;
      element.dispatchEvent(new Event("scroll"));
    },
    side,
  );
}

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

test("annotation number edit rebuilds pairs and participates in unified undo/redo/save reentry", async ({ page, request }) => {
  const { chapter, baseline } = await chapterFixture(request);

  await page.goto("/");
  await page.locator("#chapter-select").selectOption(chapter.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator('[data-review-module="注释"]').click();

  await expect(page.locator("#active-module-rows")).toHaveText("20");
  await expect(page.locator("#annotation-pairs")).toHaveText("10");
  const visibleHeaders = page.locator("#calibration-grid .ag-header-cell-text");
  await expect(visibleHeaders).toHaveText([
    "行号",
    "行类型",
    "注释号",
    "预览",
  ]);

  const firstRow = page.locator("#calibration-grid .ag-row").first();
  const annotationNumber = firstRow.locator("input.annotation-number-input");
  await expect(annotationNumber).toHaveValue("1");

  await annotationNumber.fill("99");
  await annotationNumber.blur();

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#undo-depth")).toHaveText("1");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#annotation-pairs")).toHaveText("11");
  await expect(page.locator("#calibration-grid .ag-row").first().locator("input.annotation-number-input"))
    .toHaveValue("1");
  await scrollGridHorizontally(page, "right");
  await expect(
    page.locator("#calibration-grid .ag-row").first().locator('[col-id="annotationPairStatus"]'),
  ).toHaveText("待补引用");

  await page.locator("#undo").click();
  await scrollGridHorizontally(page, "left");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#annotation-pairs")).toHaveText("10");
  await expect(page.locator("#calibration-grid .ag-row").first().locator("input.annotation-number-input"))
    .toHaveValue("1");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("1");

  await page.locator("#redo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#annotation-pairs")).toHaveText("11");
  await expect(page.locator("#calibration-grid .ag-row").first().locator("input.annotation-number-input"))
    .toHaveValue("1");

  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator("#close").click();
  await page.locator("#open-chapter").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator('[data-review-module="注释"]').click();

  await expect(page.locator("#active-module-rows")).toHaveText("20");
  await expect(page.locator("#annotation-pairs")).toHaveText("11");
  await expect(page.locator("#calibration-grid .ag-row").first().locator("input.annotation-number-input"))
    .toHaveValue("1");
  await scrollGridHorizontally(page, "right");
  await expect(
    page.locator("#calibration-grid .ag-row").first().locator('[col-id="annotationPairStatus"]'),
  ).toHaveText("待补引用");

  await page.locator("#close").click();
  await restoreBaseline(request, chapter.id, baseline);
});

test("ignored annotation survives annotation rescan and reentry while pair status reflects missing reference", async ({ page, request }) => {
  const { chapter, baseline } = await chapterFixture(request);

  await page.goto("/");
  await page.locator("#chapter-select").selectOption(chapter.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator('[data-review-module="注释"]').click();

  await expect(page.locator("#active-module-rows")).toHaveText("20");
  const firstLineType = page.locator(
    "#calibration-grid .ag-row select.calibration-line-type",
  ).first();
  await expect(firstLineType).toHaveValue("注释引用");
  await firstLineType.selectOption("已忽略");

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#active-module-rows")).toHaveText("19");
  await expect(page.locator("#annotation-pairs")).toHaveText("10");
  await scrollGridHorizontally(page, "right");
  await expect(
    page.locator('#calibration-grid [col-id="annotationPairStatus"]').filter({
      hasText: "待补引用",
    }),
  ).toHaveCount(1);

  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator("#close").click();
  await page.locator("#open-chapter").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator('[data-review-module="注释"]').click();

  await expect(page.locator("#active-module-rows")).toHaveText("19");
  await expect(page.locator("#annotation-pairs")).toHaveText("10");
  await scrollGridHorizontally(page, "right");
  await expect(
    page.locator('#calibration-grid [col-id="annotationPairStatus"]').filter({
      hasText: "待补引用",
    }),
  ).toHaveCount(1);

  await page.locator("#close").click();
  await restoreBaseline(request, chapter.id, baseline);
});
