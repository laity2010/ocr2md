import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zr3sAAAAASUVORK5CYII=";

test("image clipboard paste writes chapter imgs and inserts an Obsidian embed at the cursor", async ({ page, request }) => {
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const chapter = catalog.chapters.find(
    (item) => item.ready && item.name === "01 Buffett’s Alpha",
  );
  expect(chapter).toBeTruthy();

  const baseline = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter!.id)}`,
  ).then((response) => response.json() as Promise<{
    workingText: string;
    sidecar: unknown;
    revision: string;
  }>);

  await page.goto("/");
  await page.locator("#chapter-select").selectOption(chapter!.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const editor = page.locator("#working-editor .cm-content");
  await editor.click();
  const beforeLength = Number(await page.locator("#working-length").textContent());

  const pasteHandled = await editor.evaluate((element, base64) => {
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([bytes], "clipboard.png", { type: "image/png" }));
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard,
    });
    return !element.dispatchEvent(event);
  }, PNG_1X1_BASE64);
  expect(pasteHandled).toBeTruthy();

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  const previewImage = page.locator(
    '#markdown-preview img[src^="/__workspace/chapter/image?"]',
  ).first();
  await expect(previewImage).toHaveCount(1);
  await expect.poll(() => previewImage.evaluate(
    (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
  )).toBe(true);
  const afterLength = Number(await page.locator("#working-length").textContent());
  expect(afterLength).toBeGreaterThan(beforeLength);

  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const persisted = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter!.id)}`,
  ).then((response) => response.json() as Promise<{
    workingText: string;
    storagePath: string;
    revision: string;
  }>);
  const match = /!\[\[(imgs\/image-[^\]]+\.png)\]\]/.exec(persisted.workingText);
  expect(match?.[1]).toBeTruthy();
  const imagePath = join(dirname(persisted.storagePath), match![1]);
  expect(existsSync(imagePath)).toBeTruthy();
  expect(readFileSync(imagePath).toString("base64")).toBe(PNG_1X1_BASE64);

  const restoreResponse = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapter!.id,
      expectedRevision: persisted.revision,
      workingText: baseline.workingText,
      sidecar: baseline.sidecar,
    },
  });
  expect(restoreResponse.ok()).toBeTruthy();
  if (existsSync(imagePath)) unlinkSync(imagePath);
});
