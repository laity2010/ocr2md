import { expect, test } from "@playwright/test";

test("illegal line-break calibration drives real export merge decisions and survives save/reentry", async ({ page, request }) => {
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

  await page.goto("/");
  await page.locator("#chapter-select").selectOption(chapter.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator('[data-review-module="非法断行"]').click();

  await expect(page.locator("#active-module-rows")).toHaveText("6");
  await expect(page.locator("#illegal-export-status")).toHaveText(
    "导出效果：6 条“合并”标定 → 6 组断行合并 · 已忽略 3 条",
  );

  const baselineWorkingLength = await page.locator("#working-length").textContent();
  const firstRow = page.locator("#calibration-grid .ag-row").first();
  const contextText = await firstRow
    .locator(".illegal-line-break-preview")
    .textContent();
  expect(contextText).toContain("⏎");
  const [left = "", right = ""] = (contextText ?? "").split("⏎").map((part) => part.trim());
  expect(Array.from(left)).toHaveLength(10);
  expect(Array.from(right)).toHaveLength(10);

  const mergedPreview = await firstRow
    .locator('[col-id="illegalBreakMerged"]')
    .textContent();
  expect(mergedPreview?.trim().length).toBeGreaterThan(20);

  await expect(page.locator('#calibration-grid [role="grid"]')).toHaveAttribute(
    "aria-colcount",
    "5",
  );
  const horizontalScroll = page.locator(
    "#calibration-grid .ag-body-horizontal-scroll-viewport",
  );
  await horizontalScroll.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    element.dispatchEvent(new Event("scroll"));
  });
  const reason = await page
    .locator('#calibration-grid [col-id="breakReason"]')
    .first()
    .textContent();
  expect(reason?.trim().length).toBeGreaterThan(0);

  await horizontalScroll.evaluate((element) => {
    element.scrollLeft = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  const lineType = firstRow.locator("select.calibration-line-type");
  await expect(lineType).toHaveValue("合并");
  await expect(lineType.locator("option")).toHaveText(["合并", "已忽略"]);
  await lineType.selectOption("已忽略");

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(baselineWorkingLength!);
  await expect(page.locator("#active-module-rows")).toHaveText("5");
  await expect(page.locator("#illegal-export-status")).toHaveText(
    "导出效果：5 条“合并”标定 → 5 组断行合并 · 已忽略 4 条",
  );
  await expect(page.locator("#undo-depth")).toHaveText("1");

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-module-rows")).toHaveText("6");
  await expect(page.locator("#illegal-export-status")).toHaveText(
    "导出效果：6 条“合并”标定 → 6 组断行合并 · 已忽略 3 条",
  );
  await expect(page.locator("#redo-depth")).toHaveText("1");

  await page.locator("#redo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#active-module-rows")).toHaveText("5");
  await expect(page.locator("#illegal-export-status")).toHaveText(
    "导出效果：5 条“合并”标定 → 5 组断行合并 · 已忽略 4 条",
  );

  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator("#close").click();

  await page.locator("#open-chapter").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator('[data-review-module="非法断行"]').click();
  await expect(page.locator("#active-module-rows")).toHaveText("5");
  await expect(page.locator("#illegal-export-status")).toHaveText(
    "导出效果：5 条“合并”标定 → 5 组断行合并 · 已忽略 4 条",
  );
  await expect(page.locator("#working-length")).toHaveText(baselineWorkingLength!);

  await page.locator("#close").click();
  const currentResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter.id)}`,
  );
  const current = await currentResponse.json() as { revision: string };
  const restore = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapter.id,
      expectedRevision: current.revision,
      workingText: baseline.workingText,
      sidecar: baseline.sidecar,
    },
  });
  expect(restore.ok()).toBe(true);
  const restored = await restore.json() as { revision: string };
  expect(restored.revision).toBe(baseline.revision);
});
