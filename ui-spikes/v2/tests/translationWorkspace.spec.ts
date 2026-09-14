import { expect, test } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(
  process.env.OCR2MD_V2_TEST_PROJECT_DIR ?? ".tmp/persistent-project",
);

type FileSnapshot = {
  existed: boolean;
  bytes?: Buffer;
};

async function snapshotFile(filePath: string): Promise<FileSnapshot> {
  try {
    await stat(filePath);
    return { existed: true, bytes: await readFile(filePath) };
  } catch {
    return { existed: false };
  }
}

async function restoreFile(filePath: string, snapshot: FileSnapshot): Promise<void> {
  if (snapshot.existed) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, snapshot.bytes!);
    return;
  }
  await rm(filePath, { force: true });
}

test("clicking chapter trans opens editable working draft with text-block review", async ({ page, request }) => {
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const chapter = catalog.chapters.find(
    (item) => item.ready && item.name === "01 Buffett’s Alpha",
  ) ?? catalog.chapters.find((item) => item.ready);
  expect(chapter).toBeTruthy();

  const chapterDir = path.join(projectDir, "chapters", chapter!.name);
  const transDir = path.join(chapterDir, "trans");
  const sourcePath = path.join(transDir, `${chapter!.name}.md`);
  const workingPath = path.join(transDir, `${chapter!.name}.working.md`);
  const sourceBefore = await snapshotFile(sourcePath);
  const workingBefore = await snapshotFile(workingPath);
  const sourceText = [
    "---",
    "ocr2md_format_calibrated: true",
    "---",
    "# Trans Fixture",
    "",
    "First block line one.",
    "<br>",
    "Second block.",
    "",
  ].join("\n");

  try {
    await mkdir(transDir, { recursive: true });
    await writeFile(sourcePath, sourceText, "utf8");
    await rm(workingPath, { force: true });

    await page.goto("/");
    await expect(page.locator("#state-value")).toHaveText("idle");

    const transValue = `__node_trans_${chapter!.id}__`;
    const transNode = page.locator(`#chapter-select option[value="${transValue}"]`);
    await expect(transNode).toBeEnabled();
    await expect(transNode).toHaveText("\u3000\u3000└─ trans");

    await page.locator("#chapter-select").selectOption(transValue);
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    await expect(page.locator("#chapter-select")).toHaveValue(transValue);
    await expect(page.locator("#chapter-path")).toContainText(
      `/trans/${chapter!.name}.working.md`,
    );
    await expect(page.locator("#save")).toHaveText("保存工作稿");
    await expect(page.locator("#export-calibration")).toBeHidden();
    await expect(page.locator("#reset-calibration")).toBeHidden();

    expect(await readFile(workingPath, "utf8")).toBe(sourceText);
    await expect(page.locator("#working-editor .cm-content")).toContainText(
      "First block line one.",
    );
    await expect(page.locator("#markdown-preview")).toContainText(
      "First block line one.",
    );

    await expect(page.locator("#chapter-element-picker")).toBeHidden();
    await expect(page.locator("#translation-element-picker")).toBeVisible();
    await expect(page.locator("#translation-element-tab")).toHaveText("trans 翻译/文本块 ▾");
    await expect(page.locator("#active-review-module")).toHaveText("文本块");
    await expect(page.locator("#active-module-rows")).toHaveText("2");
    await page.locator("#translation-element-tab").click();
    await expect(page.locator('[data-review-module="文本块"]')).toBeVisible();
    await expect(page.locator("#calibration-grid .ag-header-cell-text")).toHaveText([
      "行号",
      "行类型",
      "预览",
    ]);
    await expect(page.locator("#calibration-grid .ag-row")).toHaveCount(2);
    await expect(page.locator("#calibration-grid .ag-row").nth(0)).toContainText(
      "First block line one.",
    );
    await expect(page.locator("#calibration-grid .ag-row").nth(1)).toContainText(
      "Second block.",
    );

    const editor = page.locator("#working-editor .cm-content");
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("<br>\nThird block.");
    await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
    await expect(page.locator("#save")).toBeEnabled();
    await expect(page.locator("#active-module-rows")).toHaveText("3");
    await expect(page.locator("#markdown-preview")).toContainText("Third block.");

    await page.locator("#save").click();
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    await expect(page.locator("#save")).toBeDisabled();
    expect(await readFile(workingPath, "utf8")).toContain("Third block.");
    expect(await readFile(sourcePath, "utf8")).toBe(sourceText);

    await page.reload();
    await expect(page.locator("#state-value")).toHaveText("idle");
    await page.locator("#chapter-select").selectOption(transValue);
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    await expect(page.locator("#working-editor .cm-content")).toContainText("Third block.");
    await expect(page.locator("#active-module-rows")).toHaveText("3");

    const current = await request.get(
      `/__workspace/translation?chapterId=${encodeURIComponent(chapter!.id)}`,
    ).then((response) => response.json() as Promise<{
      revision: string;
      workingText: string;
    }>);
    const firstWrite = await request.post("/__workspace/translation", {
      data: {
        chapterId: chapter!.id,
        expectedRevision: current.revision,
        workingText: current.workingText + "\nExternal update.\n",
      },
    });
    expect(firstWrite.ok()).toBeTruthy();
    const staleWrite = await request.post("/__workspace/translation", {
      data: {
        chapterId: chapter!.id,
        expectedRevision: current.revision,
        workingText: current.workingText + "\nStale overwrite.\n",
      },
    });
    expect(staleWrite.status()).toBe(409);
    await expect(staleWrite.json()).resolves.toMatchObject({
      error: expect.stringContaining("已拒绝覆盖"),
    });
  } finally {
    await restoreFile(sourcePath, sourceBefore);
    await restoreFile(workingPath, workingBefore);
  }
});
