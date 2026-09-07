import { expect, test, type APIRequestContext } from "@playwright/test";

async function firstReadyChapter(request: APIRequestContext) {
  const catalogResponse = await request.get("/__workspace/chapters");
  const catalog = await catalogResponse.json() as {
    chapters: Array<{ id: string; name: string; ready: boolean }>;
  };
  return catalog.chapters.find((item) => item.name === "01 Buffett’s Alpha")!;
}

test("stale page save is rejected when working changed externally", async ({ page, request }) => {
  const chapter = await firstReadyChapter(request);

  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#chapter-select").selectOption(chapter.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const beforeResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter.id)}`,
  );
  const before = await beforeResponse.json() as {
    workingText: string;
    sidecar: Record<string, unknown>;
    revision: string;
  };

  const externalText = before.workingText + "外";
  const externalSave = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapter.id,
      expectedRevision: before.revision,
      workingText: externalText,
      sidecar: before.sidecar,
    },
  });
  expect(externalSave.ok()).toBe(true);

  const editor = page.locator("#working-editor .cm-content");
  await editor.click();
  await page.keyboard.type("L");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");

  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#save-error")).toContainText("已在其他位置更新");
  await expect(page.locator("#can-save")).toHaveText("是");

  const currentResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter.id)}`,
  );
  const current = await currentResponse.json() as { revision: string };
  const restore = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapter.id,
      expectedRevision: current.revision,
      workingText: before.workingText,
      sidecar: before.sidecar,
    },
  });
  expect(restore.ok()).toBe(true);
});

test("stale page save is rejected when sidecar changed externally", async ({ page, request }) => {
  const chapter = await firstReadyChapter(request);

  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#chapter-select").selectOption(chapter.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const beforeResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter.id)}`,
  );
  const before = await beforeResponse.json() as {
    workingText: string;
    sidecar: {
      annotations?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
    revision: string;
  };

  const externalSidecar = structuredClone(before.sidecar);
  const firstAnnotation = externalSidecar.annotations?.find(
    (row) => row.lineType !== "已忽略" && row.lineType !== "已删除",
  );
  expect(firstAnnotation).toBeTruthy();
  firstAnnotation!.lineType = "已忽略";

  const externalSave = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapter.id,
      expectedRevision: before.revision,
      workingText: before.workingText,
      sidecar: externalSidecar,
    },
  });
  expect(externalSave.ok()).toBe(true);

  const editor = page.locator("#working-editor .cm-content");
  await editor.click();
  await page.keyboard.type("S");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");

  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#save-error")).toContainText("已在其他位置更新");

  const currentResponse = await request.get(
    `/__workspace/chapter?chapterId=${encodeURIComponent(chapter.id)}`,
  );
  const current = await currentResponse.json() as { revision: string };
  const restore = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapter.id,
      expectedRevision: current.revision,
      workingText: before.workingText,
      sidecar: before.sidecar,
    },
  });
  expect(restore.ok()).toBe(true);
});
