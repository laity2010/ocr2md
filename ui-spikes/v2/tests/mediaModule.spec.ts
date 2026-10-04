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
  const mediaPreviewBounds = await page.locator("#markdown-preview").evaluate((host) => {
    const image = host.querySelector<HTMLImageElement>(".media-preview-image");
    if (!image) return null;
    const hostRect = host.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    return {
      hostTop: hostRect.top,
      hostBottom: hostRect.bottom,
      imageTop: imageRect.top,
      imageBottom: imageRect.bottom,
      imageWidth: imageRect.width,
      imageHeight: imageRect.height,
    };
  });
  expect(mediaPreviewBounds).not.toBeNull();
  expect(mediaPreviewBounds!.imageWidth).toBeGreaterThan(0);
  expect(mediaPreviewBounds!.imageHeight).toBeGreaterThan(0);
  expect(mediaPreviewBounds!.imageTop).toBeGreaterThanOrEqual(mediaPreviewBounds!.hostTop);
  expect(mediaPreviewBounds!.imageBottom).toBeLessThanOrEqual(mediaPreviewBounds!.hostBottom + 1);
  await expect(page.locator("#markdown-preview .media-preview-caption")).toHaveText(
    saved.fileName,
  );
  await expect(page.locator("#source-location-status")).toHaveText(
    `媒体预览：${saved.fileName}`,
  );
  await expect(page.locator("#undo-depth")).toHaveText(beforeUndo ?? "0");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  // Select a source line first: media drag/drop deliberately uses the highlighted
  // line as a stable iPad-friendly target instead of touch coordinates inside text.
  const firstSourceLine = page.locator("#working-editor .cm-line").first();
  await firstSourceLine.click({ position: { x: 24, y: 8 } });
  await expect(page.locator(
    "#working-editor .cm-lineNumbers .cm-activeLineGutter",
  )).toHaveText("1");

  // A pasted local image is persisted before CodeMirror inserts the Markdown.
  // The media catalog must refresh immediately from that persisted result,
  // otherwise the current page keeps the stale pre-paste chapter.media array.
  await page.locator("#working-editor .cm-content").evaluate((node, base64) => {
    const binary = atob(base64 as string);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "clipboard.png", { type: "image/png" }));
    node.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
  }, PNG_1X1_BASE64);

  await expect(page.locator("#editor-mode-status")).toContainText("图片已粘贴");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  const pasteStatus = await page.locator("#editor-mode-status").textContent();
  const pastedFile = /imgs\/(image-[^\s]+\.png)/.exec(pasteStatus ?? "")?.[1];
  expect(pastedFile).toBeTruthy();
  const pastedRow = grid.locator(".ag-row", { hasText: pastedFile! });
  await expect(pastedRow).toHaveCount(1);
  await expect(pastedRow).toContainText("已采用");

  const dragSource = unusedRow.locator(".media-file-drag-source");
  const sourceBox = await dragSource.boundingBox();
  const targetBox = await page.locator("#working-editor").boundingBox();
  expect(sourceBox).toBeTruthy();
  expect(targetBox).toBeTruthy();
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + sourceBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox!.x + targetBox!.width / 2,
    targetBox!.y + targetBox!.height / 2,
    { steps: 8 },
  );
  await expect(page.locator("#working-editor")).toHaveClass(/is-media-drop-ready/);
  await page.mouse.up();

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#source-location-status")).toHaveText(
    `媒体已插入：![[${unused.relativePath}]]`,
  );
  await expect(page.locator("#working-editor")).toContainText(
    `![[${unused.relativePath}]]`,
  );
  await expect(grid.locator(".ag-row", { hasText: unused.fileName })).toContainText("已采用");
  await expect(page.locator(
    "#working-editor .cm-lineNumbers .cm-activeLineGutter",
  )).toHaveText("1");
});
