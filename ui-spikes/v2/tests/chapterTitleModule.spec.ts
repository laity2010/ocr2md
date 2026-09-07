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

test("chapter title level edit is one unified history action and numbering uses formal export", async ({ page, request }) => {
  const { chapter, baseline } = await chapterFixture(request);

  await page.goto("/");
  await page.locator("#chapter-select").selectOption(chapter.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-review-module")).toHaveText("章节标题");

  await expect(page.locator("#active-module-rows")).toHaveText("10");
  await expect(page.locator("#heading-toolbar")).toBeVisible();
  await expect(page.locator("#heading-numbering")).toBeChecked();
  await expect(page.locator("#title-export-status")).toHaveText(
    "导出效果：10 个标题 · 导出标题 10 个 · 已编号 10 个",
  );

  const headers = await page.locator("#calibration-grid .ag-header-cell-text").allTextContents();
  expect(headers).toEqual(["行号", "行类型", "标题预览"]);

  const rows = page.locator("#calibration-grid .ag-row");
  const firstPreview = rows.nth(0).locator(".chapter-heading-preview");
  const secondPreview = rows.nth(1).locator(".chapter-heading-preview");
  await expect(firstPreview).toContainText("(001)");
  await expect(secondPreview).toContainText("(002)");
  expect(await firstPreview.evaluate((node) => node.tagName)).toBe("H1");
  expect(await secondPreview.evaluate((node) => node.tagName)).toBe("H2");

  const headingStyles = await page.evaluate(() => {
    const h1 = document.querySelector<HTMLElement>(
      "#calibration-grid h1.chapter-heading-preview",
    );
    const h2 = document.querySelector<HTMLElement>(
      "#calibration-grid h2.chapter-heading-preview",
    );
    if (!h1 || !h2) return null;
    const h1Style = getComputedStyle(h1);
    const h2Style = getComputedStyle(h2);
    return {
      h1Color: h1Style.color,
      h1Size: parseFloat(h1Style.fontSize),
      h1Weight: h1Style.fontWeight,
      h1WhiteSpace: h1Style.whiteSpace,
      h2Color: h2Style.color,
      h2Size: parseFloat(h2Style.fontSize),
      h2Weight: h2Style.fontWeight,
    };
  });
  expect(headingStyles).not.toBeNull();
  expect(headingStyles!.h1Color).toBe("rgb(218, 99, 98)");
  expect(headingStyles!.h2Color).toBe("rgb(215, 127, 72)");
  expect(headingStyles!.h1Size).toBeGreaterThan(headingStyles!.h2Size);
  expect(headingStyles!.h2Size).toBeGreaterThan(13);
  expect(headingStyles!.h1Weight).toBe("500");
  expect(headingStyles!.h2Weight).toBe("500");
  expect(headingStyles!.h1WhiteSpace).toBe("nowrap");

  const secondSourceLine = Number(
    (await rows.nth(1).locator('[col-id="sourceLine"]').textContent())?.trim(),
  );
  expect(secondSourceLine).toBeGreaterThan(0);
  await secondPreview.click();
  await expect(page.locator("#focused-source-line")).toHaveText(String(secondSourceLine));
  await expect(page.locator("#source-location-status")).toHaveText(
    `源码定位：第 ${secondSourceLine} 行`,
  );

  const secondLineType = rows.nth(1).locator("select.calibration-line-type");
  await expect(secondLineType).toHaveValue("2 级标题");
  await expect(secondLineType.locator("option")).toHaveText([
    "1 级标题",
    "2 级标题",
    "3 级标题",
    "4 级标题",
    "5 级标题",
    "6 级标题",
    "已忽略",
  ]);

  const baselineLength = baseline.workingText.length;
  await secondLineType.selectOption("3 级标题");

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await expect(page.locator("#undo-depth")).toHaveText("1");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#active-module-rows")).toHaveText("10");

  const editedRows = page.locator("#calibration-grid .ag-row");
  const editedSecond = editedRows.nth(1);
  await expect(editedSecond.locator("select.calibration-line-type")).toHaveValue("3 级标题");
  expect(
    await editedSecond.locator(".chapter-heading-preview").evaluate((node) => node.tagName),
  ).toBe("H3");
  await expect(editedSecond.locator(".chapter-heading-preview")).toHaveCSS(
    "color",
    "rgb(191, 152, 61)",
  );
  await expect(editedSecond.locator(".chapter-heading-preview")).toContainText("(002)");
  await expect(page.locator("#working-editor .cm-content")).toContainText("### Data Sources");

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength));
  await expect(page.locator("#calibration-grid .ag-row").nth(1).locator("select.calibration-line-type"))
    .toHaveValue("2 级标题");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("1");

  await page.locator("#redo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await expect(page.locator("#undo-depth")).toHaveText("1");
  await expect(page.locator("#redo-depth")).toHaveText("0");

  // Numbering is a workspace/export preference, not a chapter edit.
  await page.locator("#heading-numbering").uncheck();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#undo-depth")).toHaveText("1");
  await expect(page.locator("#title-export-status")).toHaveText(
    "导出效果：10 个标题 · 导出标题 10 个 · 已编号 0 个",
  );
  await expect(page.locator("#calibration-grid .chapter-heading-preview").first())
    .not.toContainText("(001)");

  await page.locator("#heading-numbering").check();
  await expect(page.locator("#undo-depth")).toHaveText("1");
  await expect(page.locator("#title-export-status")).toHaveText(
    "导出效果：10 个标题 · 导出标题 10 个 · 已编号 10 个",
  );

  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator("#close").click();
  await page.locator("#open-chapter").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-module-rows")).toHaveText("10");
  await expect(page.locator("#calibration-grid .ag-row").nth(1).locator("select.calibration-line-type"))
    .toHaveValue("3 级标题");
  const persistedAfterReentry = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter.id)}`,
  );
  const persistedPayload = await persistedAfterReentry.json() as {
    workingText: string;
  };
  expect(persistedPayload.workingText).toContain("### Data Sources");

  await page.locator("#close").click();
  await restoreBaseline(request, chapter.id, baseline);
});

test("ignored chapter heading survives title rescan and reentry", async ({ page, request }) => {
  const { chapter, baseline } = await chapterFixture(request);

  await page.goto("/");
  await page.locator("#chapter-select").selectOption(chapter.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-module-rows")).toHaveText("10");

  const firstLineType = page.locator(
    "#calibration-grid .ag-row select.calibration-line-type",
  ).first();
  await firstLineType.selectOption("已忽略");

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#active-module-rows")).toHaveText("9");
  await expect(page.locator("#working-length")).toHaveText(String(baseline.workingText.length));

  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator("#close").click();
  await page.locator("#open-chapter").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-module-rows")).toHaveText("9");
  await expect(page.locator("#title-export-status")).toHaveText(
    "导出效果：9 个标题 · 导出标题 10 个 · 已编号 9 个",
  );

  await page.locator("#close").click();
  await restoreBaseline(request, chapter.id, baseline);
});
