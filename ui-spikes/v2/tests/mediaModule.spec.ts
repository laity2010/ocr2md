import { expect, test } from "@playwright/test";

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zr3sAAAAASUVORK5CYII=";

test("media module groups adopted, unused, and external media and previews local images", async ({ page, request }) => {
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const chapter = catalog.chapters.find(
    (item) => item.ready && item.name === "01 Buffett’s Alpha",
  );
  expect(chapter).toBeTruthy();

  const upload = await request.post("/__workspace/chapter/image", {
    data: {
      chapterId: chapter!.id,
      mimeType: "image/png",
      dataBase64: PNG_1X1_BASE64,
    },
  });
  expect(upload.ok()).toBeTruthy();
  const saved = await upload.json() as {
    fileName: string;
    relativePath: string;
  };

  const unusedUpload = await request.post("/__workspace/chapter/image", {
    data: {
      chapterId: chapter!.id,
      mimeType: "image/png",
      dataBase64: PNG_1X1_BASE64,
    },
  });
  expect(unusedUpload.ok()).toBeTruthy();
  const unused = await unusedUpload.json() as {
    fileName: string;
    relativePath: string;
  };

  const chapterPayload = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter!.id)}`,
  ).then((response) => response.json() as Promise<{
    workingText: string;
    sidecar: unknown;
    revision: string;
    media: Array<{
      fileName: string;
      relativePath: string;
      sizeBytes: number;
      mimeType: string;
    }>;
  }>);
  expect(chapterPayload.media.some(
    (item) => item.relativePath === saved.relativePath,
  )).toBeTruthy();

  const externalUrl = "https://cdn.example.com/media/not-downloaded.png";
  const save = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapter!.id,
      expectedRevision: chapterPayload.revision,
      workingText: chapterPayload.workingText
        + `\n![[${saved.relativePath}]]`
        + `\n![external](${externalUrl})\n`,
      sidecar: chapterPayload.sidecar,
    },
  });
  expect(save.ok()).toBeTruthy();

  await page.goto("/");
  await page.locator("#chapter-select").selectOption(chapter!.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  await page.locator("#chapter-element-tab").click();
  await page.locator('#chapter-element-menu [data-review-module="媒体"]').click();
  await expect(page.locator("#active-review-module")).toHaveText("媒体");
  await expect(page.locator("#chapter-element-tab")).toHaveText("媒体 ▾");
  await expect(page.locator("#review-grid-status")).toContainText("媒体 ·");

  const grid = page.locator("#calibration-grid");
  await expect(grid.locator(".ag-header-cell-text")).toHaveText([
    "分组",
    "缩略图",
    "文件名",
    "大小",
  ]);
  const row = grid.locator(".ag-row", { hasText: saved.fileName });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("已采用");
  await expect(row).toContainText(saved.fileName);
  await expect(row).toContainText("B");

  const unusedRow = grid.locator(".ag-row", { hasText: unused.fileName });
  await expect(unusedRow).toHaveCount(1);
  await expect(unusedRow).toContainText("未采用");

  const externalRow = grid.locator(".ag-row", { hasText: "not-downloaded.png" });
  await expect(externalRow).toHaveCount(1);
  await expect(externalRow).toContainText("未下载");
  await expect(externalRow).toContainText("—");

  const thumbnail = row.locator("img");
  await expect(thumbnail).toHaveCount(1);
  await expect.poll(() => thumbnail.evaluate(
    (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
  )).toBe(true);

  const beforeUndo = await page.locator("#undo-depth").textContent();
  await row.click();

  const preview = page.locator("#markdown-preview .media-preview-image");
  await expect(preview).toHaveCount(1);
  await expect(preview).toHaveAttribute("alt", saved.fileName);
  await expect.poll(() => preview.evaluate(
    (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
  )).toBe(true);
  await expect(page.locator("#markdown-preview .media-preview-caption")).toHaveText(
    saved.fileName,
  );
  await expect(page.locator("#source-location-status")).toHaveText(
    `媒体预览：${saved.fileName}`,
  );
  await expect(page.locator("#undo-depth")).toHaveText(beforeUndo ?? "0");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
});
