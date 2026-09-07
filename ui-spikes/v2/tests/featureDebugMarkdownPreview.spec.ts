import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("Markdown preview feature debug follows real working edit and restores persisted baseline", async ({ page, request }) => {
  ensureFeatureDebugCopy();

  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const target = catalog.chapters.find(
    (chapter) => chapter.ready && chapter.name.includes("副本"),
  );
  expect(target).toBeTruthy();

  const baseline = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{ workingText: string; revision: string }>,
    );

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();
  await page.locator("#ui-debug-initialize").click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "true",
  );

  const preview = page.locator("#markdown-preview");
  const baselinePreview = (await preview.textContent()) ?? "";
  expect(baselinePreview.length).toBeGreaterThan(100);

  await page.evaluate(() => {
    const root = document.querySelector("#markdown-preview");
    if (!root) throw new Error("preview root missing");
    const snapshots: Array<{
      text: string;
      h2: string;
      quote: string;
      items: string[];
      semantic: {
        link: boolean;
        sup: boolean;
        katex: boolean;
        displayMath: boolean;
        table: boolean;
        h2Color: string;
        linkColor: string;
        linkDecoration: string;
        tableBorder: string;
        katexFontSize: string;
      };
    }> = [];
    (
      window as typeof window & {
        __markdownPreviewDebugSnapshots?: typeof snapshots;
      }
    ).__markdownPreviewDebugSnapshots = snapshots;
    new MutationObserver(() => {
      const h2 = root.querySelector<HTMLElement>("h2");
      const link = root.querySelector<HTMLAnchorElement>(
        'a[href="https://example.com/ocr2md-debug"]',
      );
      const sup = root.querySelector<HTMLElement>("sup");
      const katex = root.querySelector<HTMLElement>(".katex");
      const displayMath = root.querySelector<HTMLElement>(".katex-display");
      const table = root.querySelector<HTMLTableElement>("table");
      snapshots.push({
        text: root.textContent ?? "",
        h2: h2?.textContent ?? "",
        quote: root.querySelector("blockquote")?.textContent?.trim() ?? "",
        items: Array.from(root.querySelectorAll("ul > li")).map(
          (node) => node.textContent ?? "",
        ),
        semantic: {
          link: Boolean(link),
          sup: Boolean(sup),
          katex: Boolean(katex),
          displayMath: Boolean(displayMath),
          table: Boolean(table),
          h2Color: h2 ? getComputedStyle(h2).color : "",
          linkColor: link ? getComputedStyle(link).color : "",
          linkDecoration: link ? getComputedStyle(link).textDecorationLine : "",
          tableBorder: table?.querySelector("th")
            ? getComputedStyle(table.querySelector("th")!).borderTopStyle
            : "",
          katexFontSize: katex ? getComputedStyle(katex).fontSize : "",
        },
      });
    }).observe(root, { childList: true, subtree: true, characterData: true });
  });

  await page.locator("#ui-debug-toggle").click();
  const action = page.locator("#ui-debug-markdown-preview");
  await expect(action).toBeEnabled();
  await action.click();

  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "Markdown 预览功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "5/5 通过",
    { timeout: 12_000 },
  );

  const snapshots = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __markdownPreviewDebugSnapshots?: Array<{
            text: string;
            h2: string;
            quote: string;
            items: string[];
            semantic: {
              link: boolean;
              sup: boolean;
              katex: boolean;
              displayMath: boolean;
              table: boolean;
              h2Color: string;
              linkColor: string;
              linkDecoration: string;
              tableBorder: string;
              katexFontSize: string;
            };
          }>;
        }
      ).__markdownPreviewDebugSnapshots ?? [],
  );

  expect(
    snapshots.some(
      (snapshot) =>
        snapshot.h2 === "功能调试预览标题"
        && snapshot.quote === "功能调试预览引用"
        && snapshot.items.includes("功能调试预览列表一")
        && snapshot.items.includes("功能调试预览列表二"),
    ),
  ).toBe(true);
  expect(snapshots.some((snapshot) => snapshot.text.includes("功能调试预览标题"))).toBe(
    true,
  );

  expect(
    snapshots.some(
      (snapshot) =>
        snapshot.semantic.link
        && snapshot.semantic.sup
        && snapshot.semantic.katex
        && snapshot.semantic.displayMath
        && snapshot.semantic.table
        && snapshot.semantic.h2Color === "rgb(215, 127, 72)"
        && snapshot.semantic.linkColor === "rgb(131, 192, 146)"
        && snapshot.semantic.linkDecoration.includes("underline")
        && snapshot.semantic.tableBorder === "solid"
        && parseFloat(snapshot.semantic.katexFontSize) > 0,
    ),
  ).toBe(true);

  await expect(preview).not.toContainText("功能调试预览标题");
  await expect.poll(async () => (await preview.textContent()) ?? "").toBe(
    baselinePreview,
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#source-location-status")).toContainText(
    "Markdown 预览功能调试通过",
  );

  const current = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{ workingText: string; revision: string }>,
    );
  expect(current.workingText).toBe(baseline.workingText);
  expect(current.revision).toBe(baseline.revision);

  await expect(action).toBeDisabled();
});
