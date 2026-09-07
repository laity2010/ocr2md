import { expect, test } from "@playwright/test";

test("AG Grid ignored calibration saves to sidecar and survives reentry", async ({ page, request }) => {
  const catalogResponse = await request.get("/__workspace/chapters");
  const catalog = await catalogResponse.json() as {
    chapters: Array<{ id: string; name: string; ready: boolean }>;
  };
  const chapter = catalog.chapters.find((item) => item.name === "01 Buffett’s Alpha")!;
  expect(chapter.ready).toBe(true);

  const baselineResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter.id)}`,
  );
  const baseline = await baselineResponse.json() as {
    workingText: string;
    sidecar: Record<string, unknown>;
    revision: string;
  };

  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#chapter-select").selectOption(chapter.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const baselineCalibrationRows = Number(
    await page.locator("#calibration-rows").textContent(),
  );
  const baselineVisibleCalibrationRows = Number(
    await page.locator("#visible-calibration-rows").textContent(),
  );
  const baselineIgnoredCalibrationRows = Number(
    await page.locator("#ignored-calibration-rows").textContent(),
  );
  expect(baselineCalibrationRows).toBe(205);
  expect(baselineVisibleCalibrationRows).toBe(186);
  expect(baselineIgnoredCalibrationRows).toBe(15);

  const workingLength = await page.locator("#working-length").textContent();
  const lineType = page.locator("#calibration-grid select.calibration-line-type").first();
  await expect(lineType).toBeEnabled();
  await lineType.selectOption("已忽略");

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(workingLength!);
  await expect(page.locator("#calibration-rows")).toHaveText(
    String(baselineCalibrationRows),
  );
  await expect(page.locator("#visible-calibration-rows")).toHaveText(
    String(baselineVisibleCalibrationRows - 1),
  );
  await expect(page.locator("#ignored-calibration-rows")).toHaveText(
    String(baselineIgnoredCalibrationRows + 1),
  );
  await expect(page.locator("#save")).toBeEnabled();

  const changedRevision = (await page.locator("#revision").textContent())?.trim();
  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  const savedRevision = (await page.locator("#revision").textContent())?.trim();
  expect(savedRevision).not.toBe(changedRevision);
  expect(savedRevision).not.toBe(baseline.revision.slice(0, 16));

  await page.locator("#close").click();
  await page.locator("#open-chapter").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#visible-calibration-rows")).toHaveText(
    String(baselineVisibleCalibrationRows - 1),
  );
  await expect(page.locator("#ignored-calibration-rows")).toHaveText(
    String(baselineIgnoredCalibrationRows + 1),
  );
  await expect(page.locator("#working-length")).toHaveText(workingLength!);

  await page.locator("#close").click();

  const currentResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter.id)}`,
  );
  const current = await currentResponse.json() as { revision: string };
  const restoreResponse = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapter.id,
      expectedRevision: current.revision,
      workingText: baseline.workingText,
      sidecar: baseline.sidecar,
    },
  });
  expect(restoreResponse.ok()).toBe(true);
  const restored = await restoreResponse.json() as { revision: string };
  expect(restored.revision).toBe(baseline.revision);
});
