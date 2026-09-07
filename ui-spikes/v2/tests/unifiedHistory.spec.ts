import { expect, test } from "@playwright/test";

async function chapterFixture(request: import("@playwright/test").APIRequestContext) {
  const catalogResponse = await request.get("/__workspace/chapters");
  const catalog = await catalogResponse.json() as {
    chapters: Array<{ id: string; name: string; ready: boolean }>;
  };
  const chapter = catalog.chapters.find((item) => item.name === "01 Buffett’s Alpha")!;
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

test("unified Undo/Redo restores working and calibration together", async ({ page, request }) => {
  const { chapter, baseline } = await chapterFixture(request);

  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#chapter-select").selectOption(chapter.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator('[data-review-module="非法断行"]').click();

  const baselineLength = Number(await page.locator("#working-length").textContent());
  const baselineVisible = Number(await page.locator("#visible-calibration-rows").textContent());
  const baselineIgnored = Number(await page.locator("#ignored-calibration-rows").textContent());

  await expect(page.locator("#undo")).toBeDisabled();
  await expect(page.locator("#redo")).toBeDisabled();
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");

  const editor = page.locator("#working-editor .cm-content");
  await editor.click();
  await page.keyboard.type("H");

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await expect(page.locator("#undo")).toBeEnabled();
  await expect(page.locator("#redo")).toBeDisabled();
  await expect(page.locator("#undo-depth")).toHaveText("1");

  const lineType = page.locator("#calibration-grid select.calibration-line-type").first();
  await lineType.selectOption("已忽略");

  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await expect(page.locator("#visible-calibration-rows")).toHaveText(String(baselineVisible - 1));
  await expect(page.locator("#ignored-calibration-rows")).toHaveText(String(baselineIgnored + 1));
  await expect(page.locator("#undo-depth")).toHaveText("2");
  await expect(page.locator("#redo-depth")).toHaveText("0");

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await expect(page.locator("#visible-calibration-rows")).toHaveText(String(baselineVisible));
  await expect(page.locator("#ignored-calibration-rows")).toHaveText(String(baselineIgnored));
  await expect(page.locator("#undo-depth")).toHaveText("1");
  await expect(page.locator("#redo-depth")).toHaveText("1");

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength));
  await expect(page.locator("#visible-calibration-rows")).toHaveText(String(baselineVisible));
  await expect(page.locator("#ignored-calibration-rows")).toHaveText(String(baselineIgnored));
  await expect(page.locator("#can-save")).toHaveText("否");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#undo")).toBeDisabled();
  await expect(page.locator("#redo")).toBeEnabled();
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("2");

  await page.locator("#redo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await expect(page.locator("#visible-calibration-rows")).toHaveText(String(baselineVisible));
  await expect(page.locator("#undo-depth")).toHaveText("1");
  await expect(page.locator("#redo-depth")).toHaveText("1");

  await page.locator("#redo").click();
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await expect(page.locator("#visible-calibration-rows")).toHaveText(String(baselineVisible - 1));
  await expect(page.locator("#ignored-calibration-rows")).toHaveText(String(baselineIgnored + 1));
  await expect(page.locator("#undo-depth")).toHaveText("2");
  await expect(page.locator("#redo-depth")).toHaveText("0");

  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo")).toBeDisabled();
  await expect(page.locator("#redo")).toBeDisabled();
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");

  await page.locator("#close").click();
  await page.locator("#open-chapter").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await expect(page.locator("#visible-calibration-rows")).toHaveText(String(baselineVisible - 1));
  await expect(page.locator("#ignored-calibration-rows")).toHaveText(String(baselineIgnored + 1));

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

test("CodeMirror shortcuts use unified history instead of a private editor history", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#chapter-select").selectOption({ label: "chapters/01 Buffett’s Alpha" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const baselineLength = Number(await page.locator("#working-length").textContent());
  const editor = page.locator("#working-editor .cm-content");
  await editor.click();
  await page.keyboard.type("K");

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await expect(page.locator("#undo-depth")).toHaveText("1");

  await page.keyboard.press("Meta+z");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength));
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("1");

  await page.keyboard.press("Meta+Shift+z");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength + 1));
  await expect(page.locator("#undo-depth")).toHaveText("1");
  await expect(page.locator("#redo-depth")).toHaveText("0");

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#working-length")).toHaveText(String(baselineLength));
});
