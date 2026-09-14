import { expect, test } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(
  process.env.OCR2MD_V2_TEST_PROJECT_DIR ?? ".tmp/persistent-project",
);
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zr3sAAAAASUVORK5CYII=";

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

test("trans node opens editable translation working draft with text-block table", async ({ page, request }) => {
  test.setTimeout(60_000);
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const chapter = catalog.chapters.find(
    (item) => item.ready && item.name === "01 Buffett’s Alpha",
  ) ?? catalog.chapters.find((item) => item.ready);
  expect(chapter).toBeTruthy();

  const transDir = path.join(projectDir, "chapters", chapter!.name, "trans");
  const sourcePath = path.join(transDir, `${chapter!.name}.md`);
  const workingPath = path.join(transDir, `${chapter!.name}.working.md`);
  const statePath = path.join(transDir, ".ocr2md-translations.json");
  const sentenceDir = path.join(transDir, "sentences");
  const sentenceSourcePath = path.join(sentenceDir, "original.json");
  const deeplSentencePath = path.join(sentenceDir, "deepl.json");
  const chatgptSentencePath = path.join(sentenceDir, "chatgpt.json");
  const previewImagePath = path.join(
    projectDir,
    "chapters",
    chapter!.name,
    "imgs",
    "preview-demo.png",
  );
  const sourceBefore = await snapshotFile(sourcePath);
  const workingBefore = await snapshotFile(workingPath);
  const stateBefore = await snapshotFile(statePath);
  const sentenceSourceBefore = await snapshotFile(sentenceSourcePath);
  const deeplSentenceBefore = await snapshotFile(deeplSentencePath);
  const chatgptSentenceBefore = await snapshotFile(chatgptSentencePath);
  const previewImageBefore = await snapshotFile(previewImagePath);
  const longFootnote = Array.from(
    { length: 120 },
    (_, index) => `long-footnote-${index + 1}`,
  ).join(" ");
  const fixture = [
    "# Translation workspace fixture",
    "",
    "Alpha value $R_t$ rose.[^1] Next alpha sentence.",
    "<br>",
    ">",
    "![image](imgs/preview-demo.png)",
    ">>[! ]- HTML",
    ">><table><tr><td>raw-html-cell</td></tr></table>",
    "Top Award",
    "><embed id=01></embed>",
    "<br>",
    "$$",
    "E = mc^2",
    "$$",
    "<br>",
    "Beta paragraph.",
    "<br>",
    `[^1]: ${longFootnote}`,
    "<br>",
    "",
  ].join("\n");
  const marker = " saved-trans-marker";

  try {
    await mkdir(transDir, { recursive: true });
    await mkdir(path.dirname(previewImagePath), { recursive: true });
    await writeFile(sourcePath, fixture, "utf8");
    await writeFile(previewImagePath, Buffer.from(PNG_1X1_BASE64, "base64"));
    await rm(workingPath, { force: true });
    await writeFile(statePath, JSON.stringify({
      version: 1,
      sourcePath,
      entries: {
        "legacy-deepl-sentence": {
          sentenceId: "legacy-deepl-sentence",
          sourceText: "Legacy sentence.",
          sourceFingerprint: "legacy-source-fingerprint",
          contextFingerprint: "legacy-context-fingerprint",
          translatedText: "旧 DeepL 译文",
          status: "translated",
          updatedAt: "2026-08-26T00:00:00.000Z",
        },
      },
    }, null, 2) + "\n", "utf8");
    await rm(sentenceSourcePath, { force: true });
    await rm(deeplSentencePath, { force: true });
    await rm(chatgptSentencePath, { force: true });

    await page.goto("/");
    await expect(page.locator("#state-value")).toHaveText("idle");

    const transNode = page.locator(
      `#chapter-select option[value="__node_trans_${chapter!.id}__"]`,
    );
    await expect(transNode).toBeEnabled();
    await page.locator("#chapter-select").selectOption(`__node_trans_${chapter!.id}__`);

    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    await expect(page.locator("#chapter-select")).toHaveValue(
      `__node_trans_${chapter!.id}__`,
    );
    await expect(page.locator("#chapter-path")).toContainText("/trans/");
    await expect(page.locator("#chapter-path")).toContainText(".working.md");
    await expect(page.locator("#translation-element-picker")).toBeVisible();
    await expect(page.locator("#translation-element-tab")).toHaveText("trans 翻译/文本块 ▾");
    await expect(page.locator("#active-review-module")).toHaveText("文本块");
    await expect(page.locator("#active-module-rows")).toHaveText("5");
    await expect(page.locator("#save")).toHaveText("保存工作稿");
    await expect(page.locator("#export-calibration")).toBeHidden();
    await expect(page.locator("#reset-calibration")).toBeHidden();

    const migratedDeepL = JSON.parse(
      await readFile(deeplSentencePath, "utf8"),
    ) as {
      provider: string;
      entries: Record<string, { translatedText?: string }>;
    };
    expect(migratedDeepL.provider).toBe("deepl");
    expect(migratedDeepL.entries["legacy-deepl-sentence"]?.translatedText)
      .toBe("旧 DeepL 译文");
    expect(JSON.parse(await readFile(statePath, "utf8")).version).toBe(1);

    const editor = page.locator("#working-editor .cm-content");
    await expect(editor).toContainText("Alpha value $R_t$ rose.[^1] Next alpha sentence.");
    await expect(page.locator("#markdown-preview")).toContainText("Alpha value");
    const footnoteReference = page.locator(
      '#markdown-preview .ocr2md-footnote-ref[data-footnote-number="1"]',
    );
    await expect(footnoteReference).toHaveCount(1);
    await expect(footnoteReference).toHaveText("1");
    await expect(footnoteReference).toHaveCSS("font-weight", "750");
    await footnoteReference.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      node.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
    });
    const footnotePopover = page.locator(
      '.ocr2md-footnote-popover[data-footnote-number="1"]',
    );
    await expect(footnotePopover).toBeVisible({ timeout: 1_500 });
    await expect(footnotePopover.locator(".ocr2md-footnote-popover__title"))
      .toHaveText("注释 1");
    await expect(footnotePopover.locator(".ocr2md-footnote-popover__body"))
      .toHaveText(longFootnote);
    await expect.poll(() => footnotePopover.evaluate(
      (node) => node.scrollHeight > node.clientHeight,
    )).toBe(true);
    await footnoteReference.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      node.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        clientX: x,
        clientY: y - 140,
      }));
    });
    await expect.poll(() => footnotePopover.evaluate(
      (node) => node.scrollTop,
    )).toBeGreaterThan(0);
    await footnoteReference.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      node.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
    });
    await expect(footnotePopover).toHaveCount(0);
    await expect(page.locator("#markdown-preview .ocr2md-footnote-ref")).toHaveCount(1);
    const embedPreview = page.locator(
      "#markdown-preview blockquote.ocr2md-embed-block",
    );
    await expect(embedPreview).toHaveCount(1);
    await expect(embedPreview).toContainText("Top Award");
    await expect(embedPreview.locator("img")).toHaveCount(1);
    const htmlCallout = embedPreview.locator("blockquote.ocr2md-callout");
    await expect(htmlCallout).toHaveCount(1);
    await expect(htmlCallout).toHaveAttribute("data-collapsed", "true");
    await expect(htmlCallout.locator(".ocr2md-callout__label")).toHaveText("HTML");
    await expect(htmlCallout.locator(".ocr2md-callout__body")).toBeHidden();
    await expect(htmlCallout.locator("table")).toHaveCount(1);
    await expect(htmlCallout.locator("table")).toBeHidden();
    await htmlCallout.locator(".ocr2md-callout__title").click();
    await expect(htmlCallout).toHaveAttribute("data-collapsed", "false");
    await expect(htmlCallout.locator(".ocr2md-callout__body")).toBeVisible();
    await expect(htmlCallout.locator(".ocr2md-callout__rendered table")).toBeVisible();
    await expect(htmlCallout.locator("td")).toHaveText("raw-html-cell");
    await expect(htmlCallout).not.toContainText("<table><tr><td>raw-html-cell</td></tr></table>");
    await htmlCallout.locator(".ocr2md-callout__title").click();
    await expect(htmlCallout).toHaveAttribute("data-collapsed", "true");
    await expect(htmlCallout.locator(".ocr2md-callout__body")).toBeHidden();
    await expect(page.locator("#markdown-preview embed")).toHaveCount(0);
    await expect(page.locator("#markdown-preview")).not.toContainText("embed id=01");
    await expect.poll(() => embedPreview.locator("img").evaluate(
      (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
    )).toBe(true);
    await expect(page.locator("#calibration-grid")).toContainText("Translation workspace fixture");
    await expect(page.locator("#calibration-grid")).toContainText("LaTeX块");
    await expect(page.locator("#calibration-grid")).toContainText("E = mc^2");
    await expect(page.locator("#calibration-grid")).toContainText("Beta paragraph.");

    const lineTypeHeader = page.locator(
      '#calibration-grid .ag-header-cell[col-id="lineType"]',
    );
    const lineTypeCells = page.locator(
      '#calibration-grid [col-id="lineType"] .calibration-line-type-readonly',
    );
    await expect(
      page.locator("#calibration-grid select.calibration-line-type"),
    ).toHaveCount(0);
    await expect(lineTypeCells).toHaveCount(5);

    const orderBeforeHeaderClick = await lineTypeCells.allTextContents();
    await lineTypeHeader.locator(".ag-header-cell-text").click();
    await expect(lineTypeCells).toHaveText(orderBeforeHeaderClick);

    const lineTypeFilterButton = lineTypeHeader.locator(
      ".ag-header-cell-filter-button",
    );
    await expect(lineTypeFilterButton).toBeVisible();
    await lineTypeFilterButton.click();
    const lineTypeFilter = page.locator(".config-enum-filter");
    await expect(lineTypeFilter).toBeVisible();
    for (const value of ["标题", "内嵌", "LaTeX块", "文本", "注释正文"]) {
      await expect(
        lineTypeFilter.getByRole("checkbox", { name: value }),
      ).toBeChecked();
    }
    const allLineTypes = lineTypeFilter.getByRole("checkbox", { name: "All" });
    await allLineTypes.uncheck();
    await expect(page.locator("#calibration-grid .ag-row")).toHaveCount(0);
    await lineTypeFilter.getByRole("checkbox", { name: "LaTeX块" }).check();
    await expect(page.locator("#calibration-grid .ag-row")).toHaveCount(1);
    await expect(page.locator("#calibration-grid .ag-row")).toContainText("E = mc^2");
    await allLineTypes.check();
    await expect(page.locator("#calibration-grid .ag-row")).toHaveCount(5);
    await page.keyboard.press("Escape");

    await page.locator("#translation-element-tab").click();
    const sentenceModuleButton = page.locator(
      '#translation-element-menu [data-review-module="句子"]',
    );
    await expect(sentenceModuleButton).toBeVisible();
    await sentenceModuleButton.click();
    await expect(page.locator("#translation-element-tab")).toHaveText("trans 翻译/句子 ▾");
    await expect(page.locator("#active-review-module")).toHaveText("句子");
    await expect(page.locator('#calibration-grid .ag-header-cell[col-id="sentenceSource"]'))
      .toContainText("原文");
    await expect(page.locator('#calibration-grid .ag-header-cell[col-id="translationInput"]'))
      .toHaveCount(0);

    const sentenceSource = JSON.parse(
      await readFile(sentenceSourcePath, "utf8"),
    ) as {
      version: number;
      entries: Array<{
        id: string;
        sourceText: string;
        translationText: string;
        sourceFingerprint?: string;
        contextFingerprint?: string;
      }>;
    };
    expect(sentenceSource.version).toBe(1);
    const alphaSentence = sentenceSource.entries.find((entry) =>
      entry.sourceText.includes("Alpha value"));
    expect(alphaSentence).toBeTruthy();
    expect(alphaSentence!.translationText).toContain('<ocr2md-protected id="p0001"/>');
    expect(alphaSentence!.translationText).toContain('<ocr2md-protected id="p0002"/>');
    expect(alphaSentence!.translationText).not.toContain("$R_t$");
    expect(alphaSentence!.translationText).not.toContain("[^1]");
    expect(sentenceSource.entries.some((entry) => entry.sourceText.includes("E = mc^2"))).toBe(false);
    expect(sentenceSource.entries.some((entry) => entry.sourceText.includes("raw-html-cell"))).toBe(true);
    expect(sentenceSource.entries.some((entry) => entry.sourceText.includes("Top Award"))).toBe(true);

    const protectedSentenceRow = page.locator("#calibration-grid .ag-row").filter({
      hasText: "Alpha value",
    }).first();
    await expect(protectedSentenceRow).toBeVisible();
    await expect(protectedSentenceRow.locator('[col-id="sentenceSource"]'))
      .toContainText("Alpha value $R_t$ rose.[^1]");
    await expect(page.locator("#calibration-grid")).toContainText("Next alpha sentence.");
    await expect(page.locator("#calibration-grid")).not.toContainText("E = mc^2");
    await expect(page.locator("#calibration-grid")).toContainText("raw-html-cell");
    await expect(page.locator("#calibration-grid")).toContainText("Top Award");
    await expect(page.locator("#calibration-grid select.calibration-line-type")).toHaveCount(0);
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    await expect(page.locator("#save")).toBeDisabled();
    expect(await readFile(workingPath, "utf8")).toBe(fixture);

    await mkdir(sentenceDir, { recursive: true });
    await writeFile(deeplSentencePath, JSON.stringify({
      version: 1,
      provider: "deepl",
      label: "DeepL",
      sourceFile: "original.json",
      entries: {
        [alphaSentence!.id]: {
          sentenceId: alphaSentence!.id,
          sourceFingerprint: alphaSentence!.sourceFingerprint,
          contextFingerprint: alphaSentence!.contextFingerprint,
          translatedText: "DeepL Alpha 译文",
          status: "translated",
        },
      },
    }, null, 2) + "\n", "utf8");
    await writeFile(chatgptSentencePath, JSON.stringify({
      version: 1,
      provider: "chatgpt",
      label: "ChatGPT",
      sourceFile: "original.json",
      entries: {
        [alphaSentence!.id]: {
          sentenceId: alphaSentence!.id,
          sourceFingerprint: alphaSentence!.sourceFingerprint,
          contextFingerprint: alphaSentence!.contextFingerprint,
          translatedText: "ChatGPT Alpha 译文",
          status: "translated",
        },
      },
    }, null, 2) + "\n", "utf8");

    await page.locator("#chapter-select").selectOption(chapter!.id);
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    await page.locator("#chapter-select").selectOption(`__node_trans_${chapter!.id}__`);
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    await page.locator("#translation-element-tab").click();
    await page.locator('#translation-element-menu [data-review-module="句子"]').click();
    await expect(page.locator('#calibration-grid .ag-header-cell[col-id="sentenceTranslation:deepl"]'))
      .toContainText("DeepL");
    const translatedRow = page.locator("#calibration-grid .ag-row").filter({
      hasText: "Alpha value",
    }).first();
    await expect(translatedRow.locator('[col-id="sentenceTranslation:deepl"]'))
      .toContainText("DeepL Alpha 译文");
    await expect(page.locator('#calibration-grid .ag-header-cell[col-id="sentenceTranslation:chatgpt"]'))
      .toContainText("ChatGPT");
    await expect(translatedRow.locator('[col-id="sentenceTranslation:chatgpt"]'))
      .toContainText("ChatGPT Alpha 译文");

    await page.locator("#translation-element-tab").click();
    await page.locator(
      '#translation-element-menu [data-review-module="文本块"]',
    ).click();
    await expect(page.locator("#translation-element-tab")).toHaveText("trans 翻译/文本块 ▾");
    await expect(page.locator("#active-review-module")).toHaveText("文本块");

    expect(await readFile(workingPath, "utf8")).toBe(fixture);

    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(marker);
    await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
    await expect(page.locator("#save")).toBeEnabled();
    await expect(page.locator("#markdown-preview")).toContainText("saved-trans-marker");

    await page.locator("#save").click();
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    await expect(page.locator("#save")).toBeDisabled();
    expect(await readFile(workingPath, "utf8")).toContain("saved-trans-marker");

    await page.locator("#chapter-select").selectOption(chapter!.id);
    await expect(page.locator("#state-value")).toHaveText("chapter-clean", {
      timeout: 15_000,
    });
    await page.locator("#chapter-select").selectOption(`__node_trans_${chapter!.id}__`);
    await expect(page.locator("#state-value")).toHaveText("chapter-clean", {
      timeout: 15_000,
    });
    await expect(page.locator("#working-editor .cm-content")).toContainText("saved-trans-marker");
    await expect(page.locator("#active-review-module")).toHaveText("文本块");
    await expect(page.locator("#active-module-rows")).toHaveText("5");
  } finally {
    await restoreFile(sourcePath, sourceBefore);
    await restoreFile(workingPath, workingBefore);
    await restoreFile(statePath, stateBefore);
    await restoreFile(sentenceSourcePath, sentenceSourceBefore);
    await restoreFile(deeplSentencePath, deeplSentenceBefore);
    await restoreFile(chatgptSentencePath, chatgptSentenceBefore);
    await restoreFile(previewImagePath, previewImageBefore);
  }
});
