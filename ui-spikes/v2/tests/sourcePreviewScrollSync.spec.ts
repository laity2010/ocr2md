import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("source and Markdown preview scroll in both directions without dirtying chapter", async ({ page }) => {
  ensureFeatureDebugCopy();

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();
  await page.locator("#ui-debug-initialize").click();

  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#markdown-preview [data-source-line]").first()).toBeVisible();

  const sourceScroll = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(
      "#working-editor .cm-scroller",
    );
    if (!scroller) throw new Error("CodeMirror scroller missing");
    const target = Math.max(
      0,
      (scroller.scrollHeight - scroller.clientHeight) * 0.62,
    );
    scroller.scrollTop = target;
    scroller.dispatchEvent(new Event("scroll"));
    return {
      target,
      max: scroller.scrollHeight - scroller.clientHeight,
    };
  });
  expect(sourceScroll.max).toBeGreaterThan(500);
  expect(sourceScroll.target).toBeGreaterThan(200);

  await expect
    .poll(
      async () =>
        Number(
          await page
            .locator("#markdown-preview")
            .getAttribute("data-sync-source-line"),
        ),
      { timeout: 3_000 },
    )
    .toBeGreaterThan(20);
  await expect(page.locator("#markdown-preview")).toHaveAttribute(
    "data-sync-origin",
    "editor",
  );

  const sourceToPreview = await page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>("#markdown-preview");
    const scroller = document.querySelector<HTMLElement>(
      "#working-editor .cm-scroller",
    );
    if (!preview || !scroller) throw new Error("sync panes missing");

    const previewTop = preview.getBoundingClientRect().top + 20;
    const blocks = Array.from(
      preview.querySelectorAll<HTMLElement>("[data-source-line]"),
    );
    let previewBlock = blocks[0];
    for (const block of blocks) {
      if (block.getBoundingClientRect().top > previewTop) break;
      previewBlock = block;
    }

    const scrollerTop = scroller.getBoundingClientRect().top + 4;
    const gutters = Array.from(
      document.querySelectorAll<HTMLElement>(
        "#working-editor .cm-lineNumbers .cm-gutterElement",
      ),
    ).filter((node) => /^\d+$/.test((node.textContent ?? "").trim()));
    let sourceLine = 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const gutter of gutters) {
      const rect = gutter.getBoundingClientRect();
      const distance = Math.abs(rect.top - scrollerTop);
      if (distance < bestDistance) {
        bestDistance = distance;
        sourceLine = Number((gutter.textContent ?? "1").trim());
      }
    }

    return {
      previewScrollTop: preview.scrollTop,
      syncedLine: Number(preview.dataset.syncSourceLine ?? "0"),
      previewTopLine: Number(previewBlock?.dataset.sourceLine ?? "0"),
      sourceTopLine: sourceLine,
    };
  });

  expect(sourceToPreview.previewScrollTop).toBeGreaterThan(0);
  expect(sourceToPreview.syncedLine).toBeGreaterThan(20);
  expect(sourceToPreview.previewTopLine).toBe(sourceToPreview.syncedLine);
  expect(sourceToPreview.syncedLine).toBeLessThanOrEqual(
    sourceToPreview.sourceTopLine,
  );

  const previewTarget = await page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>("#markdown-preview");
    if (!preview) throw new Error("preview missing");
    const blocks = Array.from(
      preview.querySelectorAll<HTMLElement>("[data-source-line]"),
    );
    const target = blocks.find(
      (block) => Number(block.dataset.sourceLine) >= 420,
    ) ?? blocks[Math.floor(blocks.length * 0.8)];
    if (!target) throw new Error("preview target block missing");

    const previewRect = preview.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    preview.scrollTop += targetRect.top - previewRect.top - 18;
    preview.dispatchEvent(new Event("scroll"));
    return Number(target.dataset.sourceLine);
  });
  expect(previewTarget).toBeGreaterThan(100);

  await expect
    .poll(
      () => page.locator("#markdown-preview").getAttribute("data-sync-origin"),
      { timeout: 3_000 },
    )
    .toBe("preview");

  const previewToSource = await page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>("#markdown-preview");
    const scroller = document.querySelector<HTMLElement>(
      "#working-editor .cm-scroller",
    );
    if (!preview || !scroller) throw new Error("sync panes missing");

    const scrollerTop = scroller.getBoundingClientRect().top + 4;
    const gutters = Array.from(
      document.querySelectorAll<HTMLElement>(
        "#working-editor .cm-lineNumbers .cm-gutterElement",
      ),
    ).filter((node) => /^\d+$/.test((node.textContent ?? "").trim()));
    let sourceLine = 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const gutter of gutters) {
      const rect = gutter.getBoundingClientRect();
      const distance = Math.abs(rect.top - scrollerTop);
      if (distance < bestDistance) {
        bestDistance = distance;
        sourceLine = Number((gutter.textContent ?? "1").trim());
      }
    }

    return {
      syncedLine: Number(preview.dataset.syncSourceLine ?? "0"),
      sourceTopLine: sourceLine,
      editorScrollTop: scroller.scrollTop,
    };
  });

  expect(previewToSource.syncedLine).toBeGreaterThan(100);
  expect(previewToSource.editorScrollTop).toBeGreaterThan(100);
  expect(
    Math.abs(
      previewToSource.sourceTopLine - previewToSource.syncedLine,
    ),
  ).toBeLessThanOrEqual(8);

  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
});
