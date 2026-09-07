import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("workspace splitter feature debug visibly moves through real product path and restores baseline", async ({ page, request }) => {
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
      response.json() as Promise<{ workingText: string; revision: string }>,
    );

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();
  await page.locator("#ui-debug-initialize").click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "true",
  );

  await page.evaluate(() => {
    const splitter = document.querySelector("#workspace-splitter");
    if (!splitter) throw new Error("workspace splitter missing");
    const values: string[] = [];
    (window as typeof window & { __splitterDebugValues?: string[] })
      .__splitterDebugValues = values;
    new MutationObserver(() => {
      values.push(splitter.getAttribute("aria-valuenow") ?? "");
    }).observe(splitter, { attributes: true, attributeFilter: ["aria-valuenow"] });
  });

  await page.locator("#ui-debug-toggle").click();
  const action = page.locator("#ui-debug-workspace-splitter");
  await expect(action).toBeEnabled();
  await action.click();

  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "左右工作窗分割条功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "4/4 通过",
    { timeout: 10_000 },
  );

  const values = await page.evaluate(
    () =>
      (window as typeof window & { __splitterDebugValues?: string[] })
        .__splitterDebugValues ?? [],
  );
  expect(values).toContain("51");
  expect(values).toContain("59");
  expect(values.at(-1)).toBe("43");

  await expect(page.locator("#workspace-splitter")).toHaveAttribute(
    "aria-valuenow",
    "43",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#source-location-status")).toContainText(
    "43% → 51% → 59% → 43%",
  );

  const stored = await page.evaluate(() =>
    localStorage.getItem("ocr2md-v2-workspace-split-v1"),
  );
  expect(stored).toBe("43");

  const current = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{ workingText: string; revision: string }>,
    );
  expect(current.workingText).toBe(baseline.workingText);
  expect(current.revision).toBe(baseline.revision);

  await expect(action).toBeDisabled();
});
