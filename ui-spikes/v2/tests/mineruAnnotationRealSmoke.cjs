/* Read-only production-style smoke: run with OCR2MD_V2_REAL_BASE_URL
 * and OCR2MD_V2_REAL_PROJECT. No chapter/sidecar mutations. */
const { chromium } = require("@playwright/test");

async function main() {
  const base = process.env.OCR2MD_V2_REAL_BASE_URL;
  if (!base) throw new Error("OCR2MD_V2_REAL_BASE_URL required");
  const catalog = await fetch(base + "/__workspace/chapters").then((r) => r.json());
  const first = catalog.chapters.find((x) => x.name === "01 卷一");
  const seventh = catalog.chapters.find((x) => x.name === "07 卷七");
  if (!first?.id || !seventh?.id) throw new Error("Required chapters missing");
  const getNotes = async (id) => {
    const response = await fetch(
      base + "/__workspace/chapter/annotations?chapterId=" + encodeURIComponent(id),
    );
    if (!response.ok) throw new Error("Chapter annotation API failed: " + response.status);
    return response.json();
  };
  const [data, sharedData] = await Promise.all([
    getNotes(first.id),
    getNotes(seventh.id),
  ]);
  console.log("API", JSON.stringify({
    first: data.rows.length,
    seventh: sharedData.rows.length,
    matched: data.references.matched,
    unassigned: data.unassignedRows.length,
  }));
  if (data.rows.length !== 78 || sharedData.rows.length !== 103 ||
    data.references.matched !== 563) throw new Error("Real annotation API regression");
  const shared = sharedData.rows.find((row) =>
    row.lineType === "注释正文" && row.navigationTargets.length === 2);
  if (!shared || shared.navigationTargets[0].start === shared.navigationTargets[1].start) {
    throw new Error("Shared note references are not individually located");
  }

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const waitText = async (selector, match, ms = 25000) => {
    await page.waitForFunction(
      ({ selector, match }) => {
        const text = document.querySelector(selector)?.textContent ?? "";
        return text.includes(match);
      },
      { selector, match },
      { timeout: ms },
    );
  };

  try {
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await waitText("#state-value", "idle");
    if (process.env.OCR2MD_WP5_SHARED_ONLY !== "1") {
    await page.locator("#chapter-select").selectOption(first.id);
    await waitText("#chapter-name", "卷一");
    await page.locator("#chapter-element-tab").click();
    await page.locator('#chapter-element-menu [data-review-module="注释"]').click();
    await waitText("#review-grid-status", "JSON 页注释", 35000);

    const status = await page.locator("#review-grid-status").textContent();
    const headers = await page.locator("#calibration-grid .ag-header-cell-text").allTextContents();
    console.log("GRID", JSON.stringify({ status, headers }));
    if (!["PDF页", "MD行号", "注释号", "行类型", "配对状态", "预览"]
      .every((header) => headers.includes(header))) {
      throw new Error("Missing MinerU annotation columns");
    }
    const preview = async (index) => {
      const button = page.locator(
        '#calibration-grid .ag-row[row-index="' + index + '"] .mineru-note-preview',
      );
      await button.waitFor({ timeout: 15000 });
      await button.click();
      return await page.locator("#source-location-status").textContent();
    };
    const ref = await preview(0);
    const body = await preview(1);
    const working = await fetch(
      base + "/__workspace/chapter?chapterId=" + encodeURIComponent(first.id),
    ).then((r) => r.json());
    const line = working.workingText.split(/\r?\n/)
      .findIndex((text) => text === data.rows[0].navigationTarget?.anchorText) + 1;
    console.log("JUMP", JSON.stringify({
      ref, body, line, canonicalLine: data.rows[0].navigationTarget?.lineIndex + 1,
    }));
    if (line < 1 || !ref?.includes("MD 第 " + line + " 行") ||
      !body?.includes("MD 第 " + line + " 行")) {
      throw new Error("Ref or note-body preview did not focus the matching MD line");
    }
    }

    await page.locator("#chapter-select").selectOption(seventh.id);
    await waitText("#chapter-name", "卷七");
    // A newly opened chapter defaults to 章节标题; enter 注释 again.
    console.log("AFTER_SWITCH_MODULE", await page.locator("#active-review-module").textContent());
    if ((await page.locator("#active-review-module").textContent()) !== "注释") {
      await page.locator("#chapter-element-tab").click();
      await page.locator('#chapter-element-menu [data-review-module="注释"]').click();
    }
    await waitText("#review-grid-status", "JSON 页注释", 35000);
    console.log("CHAPTER_SWITCH", await page.locator("#review-grid-status").textContent());
    const sharedIndex = sharedData.rows.findIndex((row) => row.rowId === shared.rowId);
    const scrollInfo = await page.evaluate((index) => {
      const root = document.querySelector("#calibration-grid");
      const candidates = root
        ? [...root.querySelectorAll("[class*='viewport'], [class*='scroll']")]
          .filter((node) => node instanceof HTMLElement)
          .map((node) => ({
            cls: node.className,
            scrollHeight: node.scrollHeight,
            clientHeight: node.clientHeight,
          }))
          .filter((item) => item.scrollHeight > item.clientHeight)
        : [];
      const viewport = root?.querySelector(".ag-grid-viewport")
        ?? root?.querySelector(".ag-body-viewport")
        ?? root?.querySelector(".ag-center-cols-viewport");
      const scroll = root?.querySelector(".ag-body-vertical-scroll-viewport");
      for (const element of [viewport, scroll]) {
        if (!(element instanceof HTMLElement)) continue;
        element.scrollTop = Math.max(0, (index - 3) * 42);
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
      const renderedIndexes = [...(root?.querySelectorAll(".ag-row[row-index]") ?? [])]
        .map((node) => node.getAttribute("row-index"))
        .slice(0, 20);
      return { selected: viewport?.className ?? "(none)", candidates, renderedIndexes };
    }, sharedIndex);
    console.log("SCROLL", JSON.stringify(scrollInfo));
    const sharedButton = page.locator(
      '#calibration-grid .ag-row[row-index="' + sharedIndex + '"] .mineru-note-preview',
    );
    await sharedButton.waitFor({ timeout: 15000 });
    await sharedButton.click();
    const firstShared = await page.locator("#source-location-status").textContent();
    await sharedButton.click();
    const secondShared = await page.locator("#source-location-status").textContent();
    console.log("SHARED_JUMP", JSON.stringify({
      firstShared, secondShared, sharedIndex,
    }));
    if (!firstShared?.includes("共享引用 1/2") ||
      !secondShared?.includes("共享引用 2/2")) {
      throw new Error("Shared note did not cycle between two MD positions");
    }

    if (errors.length) throw new Error("Browser page errors: " + errors.join("; "));
    console.log("WP5_BROWSER_PASS");
  } catch (error) {
    await page.screenshot({
      path: "/tmp/ocr2md-wp5-failed.png",
      fullPage: true,
    }).catch(() => {});
    console.log("BROWSER_FAIL", error.stack);
    console.log("PAGE_ERRORS", JSON.stringify(errors));
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 2;
});
