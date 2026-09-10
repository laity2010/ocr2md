import { expect, test } from "@playwright/test";

test("media download checkpoints each external image and adopts local references", async ({ page, request }) => {
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const chapter = catalog.chapters.find(
    (item) => item.ready && item.name === "01 Buffett’s Alpha",
  );
  expect(chapter).toBeTruthy();

  await page.goto("/");
  await page.locator("#chapter-select").selectOption(chapter!.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator("#chapter-element-tab").click();
  await page.locator('#chapter-element-menu [data-review-module="媒体"]').click();

  const button = page.locator("#media-download");
  await expect(button).toHaveText("下载未下载媒体（5）");
  await expect(page.locator("#calibration-grid .ag-row", { hasText: "未下载" })).toHaveCount(5);

  await button.click();
  await expect(button).toHaveText("已全部下载", { timeout: 25_000 });
  await expect(page.locator("#media-download-status")).toContainText("已全部采用本地媒体");
  await expect(page.locator("#calibration-grid .ag-row", { hasText: "未下载" })).toHaveCount(0);
  await expect(page.locator("#calibration-grid .ag-row", { hasText: "已采用" })).toHaveCount(5);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");

  const persisted = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter!.id)}`,
  ).then((response) => response.json() as Promise<{
    workingText: string;
    media: Array<{ relativePath: string }>;
  }>);
  expect(persisted.media).toHaveLength(5);
  expect((persisted.workingText.match(/https:\/\/cdn-mineru\.openxlab\.org\.cn/g) ?? []).length).toBe(0);
  expect((persisted.workingText.match(/!\[image\]\(imgs\/image-/g) ?? []).length).toBe(5);
});
