import { expect, test } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(
  process.env.OCR2MD_V2_TEST_PROJECT_DIR ?? ".tmp/persistent-project",
);

test("source-to-translation keeps the normal document and opens sentence translations as popovers", async ({ page, request }) => {
  test.setTimeout(60_000);
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{ chapters: Array<{ id: string; name: string; ready: boolean }> }>,
  );
  const chapter = catalog.chapters.find((item) => item.ready);
  expect(chapter).toBeTruthy();

  const transDir = path.join(projectDir, "chapters", chapter!.name, "trans");
  const sourcePath = path.join(transDir, `${chapter!.name}.md`);
  const workingPath = path.join(transDir, `${chapter!.name}.working.md`);
  const sentenceDir = path.join(transDir, "sentences");
  const originalPath = path.join(sentenceDir, "original.json");
  const chatgptPath = path.join(sentenceDir, "chatgpt.json");
  const deeplPath = path.join(sentenceDir, "deepl.json");
  const fixture = [
    "# Translation pair fixture",
    "<br>",
    "Alpha value $R_t$ rose. Beta sentence.",
    "<br>",
    "Gamma note.[^1]",
    "<br>",
    ">",
    ">>[! ]- HTML",
    ">><table><tr><td>raw-html-cell</td></tr></table>",
    "B panel sentence.",
    "><embed id=01></embed>",
    "<br>",
    "$$",
    "E = mc^2",
    "$$",
    "<br>",
    "[^1]: Footnote body here.",
    "<br>",
  ].join("\n");

  await mkdir(transDir, { recursive: true });
  await writeFile(sourcePath, fixture, "utf8");
  await rm(workingPath, { force: true });
  await rm(sentenceDir, { recursive: true, force: true });

  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#chapter-select").selectOption(`__node_trans_${chapter!.id}__`);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const source = JSON.parse(await readFile(originalPath, "utf8")) as {
    entries: Array<{
      id: string;
      sourceText: string;
      sourceFingerprint?: string;
      contextFingerprint?: string;
      protection: Array<{ token: string; value: string }>;
    }>;
  };
  const alpha = source.entries.find((entry) => entry.sourceText.includes("Alpha value"));
  const beta = source.entries.find((entry) => entry.sourceText.includes("Beta sentence"));
  const rawHtml = source.entries.find((entry) => entry.sourceText === "raw-html-cell");
  const bPanel = source.entries.find((entry) => entry.sourceText === "B panel sentence.");
  const footnoteBodyEntry = source.entries.find((entry) => entry.sourceText.includes("Footnote body here."));
  expect(alpha).toBeTruthy();
  expect(beta).toBeTruthy();
  expect(rawHtml).toBeTruthy();
  expect(bPanel).toBeTruthy();
  expect(footnoteBodyEntry).toBeTruthy();
  expect(alpha!.protection).toHaveLength(1);
  expect(footnoteBodyEntry!.protection).toHaveLength(1);
  const token = alpha!.protection[0].token;
  const footnoteToken = footnoteBodyEntry!.protection[0].token;

  await writeFile(chatgptPath, JSON.stringify({
    version: 1,
    provider: "chatgpt",
    label: "ChatGPT",
    sourceFile: "original.json",
    entries: {
      [alpha!.id]: {
        sentenceId: alpha!.id,
        sourceFingerprint: alpha!.sourceFingerprint,
        contextFingerprint: alpha!.contextFingerprint,
        translatedText: `阿尔法值 ${token} 上升。`,
        status: "translated",
      },
      [beta!.id]: {
        sentenceId: beta!.id,
        sourceFingerprint: beta!.sourceFingerprint,
        contextFingerprint: beta!.contextFingerprint,
        translatedText: "贝塔句子。",
        status: "translated",
      },
      [rawHtml!.id]: {
        sentenceId: rawHtml!.id,
        sourceFingerprint: rawHtml!.sourceFingerprint,
        contextFingerprint: rawHtml!.contextFingerprint,
        translatedText: "HTML 单元格译文",
        status: "translated",
      },
      [bPanel!.id]: {
        sentenceId: bPanel!.id,
        sourceFingerprint: bPanel!.sourceFingerprint,
        contextFingerprint: bPanel!.contextFingerprint,
        translatedText: "B 面板句子。",
        status: "translated",
      },
      [footnoteBodyEntry!.id]: {
        sentenceId: footnoteBodyEntry!.id,
        sourceFingerprint: footnoteBodyEntry!.sourceFingerprint,
        contextFingerprint: footnoteBodyEntry!.contextFingerprint,
        translatedText: `${footnoteToken}这里是中文注释正文。`,
        status: "translated",
      },
    },
  }, null, 2) + "\n", "utf8");
  // Keep DeepL present but less complete: the reading module should choose the
  // most complete available translation file rather than the active executor.
  await writeFile(deeplPath, JSON.stringify({
    version: 1,
    provider: "deepl",
    label: "DeepL",
    sourceFile: "original.json",
    entries: {},
  }, null, 2) + "\n", "utf8");

  const normalPreview = await page.locator("#markdown-preview").evaluate((root) => ({
    text: root.textContent,
    h1: root.querySelectorAll("h1").length,
    blockquotes: root.querySelectorAll("blockquote").length,
    callouts: root.querySelectorAll(".ocr2md-callout").length,
    tables: root.querySelectorAll("table").length,
    katex: root.querySelectorAll(".katex").length,
  }));

  await page.locator("#translation-element-tab").click();
  await page.locator('#translation-element-menu [data-review-module="原文to译文"]').click();
  await expect(page.locator("#translation-element-tab")).toHaveText("trans 翻译/原文to译文 ▾");

  // Source editor is gone in reading mode; the normal preview takes the full
  // right pane height.
  await expect(page.locator("#editor-pane")).toHaveClass(/translation-reading-layout/);
  await expect(page.locator("#working-editor")).toBeHidden();
  await expect(page.locator("#editor-preview-splitter")).toBeHidden();
  await expect(page.locator("#markdown-preview")).toBeVisible();

  // Normal Markdown/Obsidian structures are still rendered, not flattened into
  // a sentence list. The reading mode may only add sentence interaction marks.
  const readingPreview = await page.locator("#markdown-preview").evaluate((root) => ({
    text: root.textContent,
    h1: root.querySelectorAll("h1").length,
    blockquotes: root.querySelectorAll("blockquote").length,
    callouts: root.querySelectorAll(".ocr2md-callout").length,
    tables: root.querySelectorAll("table").length,
    katex: root.querySelectorAll(".katex").length,
  }));
  expect(readingPreview).toEqual(normalPreview);
  await expect(page.locator("#markdown-preview h1")).toContainText("Translation pair fixture");
  await expect(page.locator("#markdown-preview")).toContainText("raw-html-cell");
  await expect(page.locator("#markdown-preview .source-translation-list")).toHaveCount(0);

  const sentence = page.locator("#markdown-preview .ocr2md-translation-sentence").filter({
    hasText: "Alpha value",
  }).first();
  await expect(sentence).toBeVisible();
  await sentence.click();
  const popover = page.locator(".ocr2md-translation-popover");
  await expect(popover).toBeVisible();
  await expect(popover.locator(".ocr2md-translation-popover__title")).toHaveText("ChatGPT 译文");
  await expect(popover.locator(".ocr2md-translation-popover__body")).toContainText("阿尔法值 $R_t$ 上升。");
  await expect(popover).not.toContainText("ocr2md-protected");

  await sentence.click();
  await expect(popover).toHaveCount(0);

  // Embedded HTML keeps its original table structure while visible text
  // participates in the same sentence translation popover flow.
  const embeddedSentence = page.locator("#markdown-preview table .ocr2md-translation-sentence").filter({
    hasText: "raw-html-cell",
  }).first();
  await expect(embeddedSentence).toBeVisible();
  await embeddedSentence.click();
  await expect(popover).toBeVisible();
  await expect(popover.locator(".ocr2md-translation-popover__title")).toHaveText("ChatGPT 译文");
  await expect(popover.locator(".ocr2md-translation-popover__body")).toHaveText("HTML 单元格译文");
  await embeddedSentence.click();
  await expect(popover).toHaveCount(0);

  // A lower-depth sibling after a nested HTML callout must remain outside the
  // callout instead of being swallowed by markdown-it lazy continuation.
  const bPanelSentence = page.locator("#markdown-preview .ocr2md-translation-sentence").filter({
    hasText: "B panel sentence.",
  }).first();
  await expect(bPanelSentence).toBeVisible();
  await bPanelSentence.click();
  await expect(popover.locator(".ocr2md-translation-popover__body")).toHaveText("B 面板句子。");
  await bPanelSentence.click();
  await expect(popover).toHaveCount(0);

  // Footnote references inside a translatable sentence are structurally outside
  // the sentence translation hit area. Long-pressing the footnote opens only
  // the footnote popover.
  const footnote = page.locator("#markdown-preview .ocr2md-footnote-ref").filter({ hasText: "1" }).first();
  await expect(footnote).toBeVisible();
  const footnoteSentence = footnote.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' ocr2md-translation-sentence ')][1]");
  await expect(footnoteSentence).toHaveCount(0);
  // Real user interaction: a normal tap must open the footnote; a second tap
  // closes it. Long press remains available as a secondary gesture.
  const footnotePopover = page.locator(".ocr2md-footnote-popover");
  await footnote.click();
  await expect(footnotePopover).toBeVisible();
  await expect(footnotePopover).toContainText("Footnote body here.");
  await footnote.click();
  await expect(footnotePopover).toHaveCount(0);
  const box = await footnote.boundingBox();
  expect(box).toBeTruthy();
  await footnote.dispatchEvent("pointerdown", {
    pointerId: 91,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    clientX: box!.x + box!.width / 2,
    clientY: box!.y + box!.height / 2,
  });
  await page.waitForTimeout(520);
  await expect(footnotePopover).toBeVisible();
  await expect(footnotePopover).toContainText("Footnote body here.");
  await expect(page.locator(".ocr2md-translation-popover")).toHaveCount(0);
  await footnote.dispatchEvent("pointerup", {
    pointerId: 91,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
  });

  // Reverse reading mode renders the translated document while preserving the
  // original Markdown/Obsidian structure. Clicking translated text reveals the
  // source sentence.
  await page.locator("#translation-element-tab").click();
  await page.locator('#translation-element-menu [data-review-module="译文to原文"]').click();
  await expect(page.locator("#translation-element-tab")).toHaveText("trans 翻译/译文to原文 ▾");
  await expect(page.locator("#editor-pane")).toHaveClass(/translation-reading-layout/);
  await expect(page.locator("#working-editor")).toBeHidden();
  await expect(page.locator("#editor-preview-splitter")).toBeHidden();

  const reversePreview = await page.locator("#markdown-preview").evaluate((root) => ({
    h1: root.querySelectorAll("h1").length,
    blockquotes: root.querySelectorAll("blockquote").length,
    callouts: root.querySelectorAll(".ocr2md-callout").length,
    tables: root.querySelectorAll("table").length,
    katex: root.querySelectorAll(".katex").length,
  }));
  expect(reversePreview).toEqual({
    h1: normalPreview.h1,
    blockquotes: normalPreview.blockquotes,
    callouts: normalPreview.callouts,
    tables: normalPreview.tables,
    katex: normalPreview.katex,
  });

  const translatedSentence = page.locator("#markdown-preview .ocr2md-translation-sentence").filter({
    hasText: "阿尔法值",
  }).first();
  await expect(translatedSentence).toBeVisible();
  await translatedSentence.click();
  await expect(popover).toBeVisible();
  await expect(popover.locator(".ocr2md-translation-popover__title")).toHaveText("原文");
  await expect(popover.locator(".ocr2md-translation-popover__body"))
    .toHaveText("Alpha value $R_t$ rose.");
  await translatedSentence.click();
  await expect(popover).toHaveCount(0);

  const translatedHtmlCell = page.locator("#markdown-preview table .ocr2md-translation-sentence").filter({
    hasText: "HTML 单元格译文",
  }).first();
  await expect(translatedHtmlCell).toBeVisible();
  await translatedHtmlCell.click();
  await expect(popover).toBeVisible();
  await expect(popover.locator(".ocr2md-translation-popover__title")).toHaveText("原文");
  await expect(popover.locator(".ocr2md-translation-popover__body")).toHaveText("raw-html-cell");
  await translatedHtmlCell.click();
  await expect(popover).toHaveCount(0);

  const translatedBPanel = page.locator("#markdown-preview .ocr2md-translation-sentence").filter({
    hasText: "B 面板句子。",
  }).first();
  await expect(translatedBPanel).toBeVisible();
  await translatedBPanel.click();
  await expect(popover.locator(".ocr2md-translation-popover__title")).toHaveText("原文");
  await expect(popover.locator(".ocr2md-translation-popover__body")).toHaveText("B panel sentence.");
  await translatedBPanel.click();
  await expect(popover).toHaveCount(0);

  // Both directions use one reading renderer. Reverse-mode footnotes must come
  // from the clean translated document, never from interactive span markup.
  const reverseFootnote = page.locator("#markdown-preview .ocr2md-footnote-ref").filter({ hasText: "1" }).first();
  await expect(reverseFootnote).toBeVisible();
  const reverseFootnotePopover = page.locator(".ocr2md-footnote-popover");
  await reverseFootnote.click();
  await expect(reverseFootnotePopover).toBeVisible();
  await expect(reverseFootnotePopover.locator(".ocr2md-footnote-popover__body"))
    .toHaveText("这里是中文注释正文。");
  await expect(reverseFootnotePopover).not.toContainText("ocr2md-translation-sentence");
  await expect(reverseFootnotePopover).not.toContainText("<span");
  await reverseFootnote.click();
  await expect(reverseFootnotePopover).toHaveCount(0);
  const reverseBox = await reverseFootnote.boundingBox();
  expect(reverseBox).toBeTruthy();
  await reverseFootnote.dispatchEvent("pointerdown", {
    pointerId: 92,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    clientX: reverseBox!.x + reverseBox!.width / 2,
    clientY: reverseBox!.y + reverseBox!.height / 2,
  });
  await page.waitForTimeout(520);
  await expect(reverseFootnotePopover).toBeVisible();
  await expect(reverseFootnotePopover.locator(".ocr2md-footnote-popover__body"))
    .toHaveText("这里是中文注释正文。");
  await expect(reverseFootnotePopover).not.toContainText("ocr2md-translation-sentence");
  await expect(reverseFootnotePopover).not.toContainText("<span");
  await reverseFootnote.dispatchEvent("pointerup", {
    pointerId: 92,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
  });
});
