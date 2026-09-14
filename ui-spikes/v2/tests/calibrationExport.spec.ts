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
  try {
    await rm(path.dirname(filePath));
  } catch {
    // Keep a non-empty/pre-existing destination directory intact.
  }
}

test("top-bar calibration export writes trans/output without entering future modules", async ({ page, request }) => {
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
  const transPath = path.join(chapterDir, "trans", `${chapter!.name}.md`);
  const outputPath = path.join(chapterDir, "output", `${chapter!.name}.md`);
  const transBefore = await snapshotFile(transPath);
  const outputBefore = await snapshotFile(outputPath);

  try {
    await rm(transPath, { force: true });
    await page.goto("/");
    await expect(page.locator("#state-value")).toHaveText("idle");
    await expect(page.locator("#export-calibration")).toBeDisabled();
    await expect(
      page.locator(`#chapter-select option[value="__node_trans_${chapter!.id}__"]`),
    ).toHaveCount(0);

    await page.locator("#chapter-select").selectOption(chapter!.id);
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    await expect(page.locator("#export-calibration")).toBeEnabled();

    const exportBox = await page.locator("#export-calibration").boundingBox();
    const viewport = page.viewportSize();
    expect(exportBox).toBeTruthy();
    expect(viewport).toBeTruthy();
    expect(exportBox!.x + exportBox!.width).toBeLessThanOrEqual(viewport!.width);

    await page.locator("#export-calibration").click();
    await expect(page.locator("#export-calibration-overlay")).toBeVisible();
    await expect(page.locator("#export-calibration-title")).toHaveText("选择标定导出目录");
    await expect(page.locator("#export-calibration-overlay")).toContainText("当前章节/trans");
    await expect(page.locator("#export-calibration-overlay")).toContainText("可进入 trans 翻译工作区");
    await expect(page.locator("#export-calibration-overlay")).toContainText("当前章节/output");
    await expect(page.locator("#export-calibration-overlay")).toContainText("阅读模块目前仅为规划，本次不实现");
    await expect(page.locator("#export-calibration-confirm")).toBeDisabled();

    await page.locator("#export-destination-output").check();
    await expect(page.locator("#export-calibration-confirm")).toBeEnabled();
    await page.locator("#export-calibration-confirm").click();
    await expect(page.locator("#export-calibration-status")).toContainText(
      `已导出：当前章节/output/${chapter!.name}.md`,
    );
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    await expect(page.locator("#chapter-name")).toHaveText(`${chapter!.name}.md`);
    await expect(page.locator("#active-review-module")).not.toHaveText("翻译");
    expect((await readFile(outputPath, "utf8")).length).toBeGreaterThan(0);
    await expect(
      page.locator(`#chapter-select option[value="__node_trans_${chapter!.id}__"]`),
    ).toHaveCount(0);

    await page.locator("#export-calibration-cancel").click();
    await expect(page.locator("#export-calibration-overlay")).toBeHidden();

    await page.locator("#export-calibration").click();
    await page.locator("#export-destination-trans").check();
    await page.locator("#export-calibration-confirm").click();
    await expect(page.locator("#export-calibration-status")).toContainText(
      `已导出：当前章节/trans/${chapter!.name}.md`,
    );
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    await expect(page.locator("#active-review-module")).not.toHaveText("翻译");
    const exportedTrans = await readFile(transPath, "utf8");
    expect(exportedTrans.length).toBeGreaterThan(0);
    expect(exportedTrans).not.toContain("内嵌图片链接:");
    const firstEmbedEnd = exportedTrans.indexOf("><embed id=");
    expect(firstEmbedEnd).toBeGreaterThan(0);
    const firstEmbedStart = exportedTrans.lastIndexOf("\n>\n", firstEmbedEnd);
    expect(firstEmbedStart).toBeGreaterThanOrEqual(0);
    const firstEmbedBlock = exportedTrans.slice(firstEmbedStart + 1, firstEmbedEnd);
    expect(firstEmbedBlock.match(/^>$/gm) ?? []).toHaveLength(1);
    const liveTransNode = page.locator(
      `#chapter-select option[value="__node_trans_${chapter!.id}__"]`,
    );
    await expect(liveTransNode).toBeEnabled();
    await expect(liveTransNode).toHaveText("\u3000\u3000└─ trans");

    await page.locator("#export-calibration-cancel").click();
    await page.reload();
    await expect(page.locator("#state-value")).toHaveText("idle");
    const reloadedTransNode = page.locator(
      `#chapter-select option[value="__node_trans_${chapter!.id}__"]`,
    );
    await expect(reloadedTransNode).toBeEnabled();
    await expect(reloadedTransNode).toHaveText("\u3000\u3000└─ trans");
    await page.locator("#chapter-select").selectOption(chapter!.id);
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    const editor = page.locator("#working-editor .cm-content");
    await editor.click();
    await page.keyboard.type("X");
    await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
    await expect(page.locator("#export-calibration")).toBeDisabled();
    await page.locator("#undo").click();
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  } finally {
    await restoreFile(transPath, transBefore);
    await restoreFile(outputPath, outputBefore);
  }
});
