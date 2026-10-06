/* AG-grid audit + original-PDF click-through smoke, on /tmp copy only. */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

async function main() {
  const base = process.env.OCR2MD_AG_BASE_URL;
  const project = process.env.OCR2MD_AG_PROJECT;
  if (!base || !project?.startsWith("/tmp/ocr2md-ag-audit-")) {
    throw new Error("Only the dedicated /tmp original-PDF fixture is allowed.");
  }
  const response = await fetch(base + "/__workspace/chapters");
  const { chapters } = await response.json();
  const first = chapters.find((c) => c.name === "01 卷一");
  const seventh = chapters.find((c) => c.name === "07 卷七");
  assert(first && seventh);
  const auditUrl = base + "/__workspace/chapter/annotation-audit?chapterId=" + encodeURIComponent(first.id);
  const initial = await fetch(auditUrl).then((r) => r.json());
  assert.strictEqual(initial.entries.length, 23);
  assert.strictEqual(initial.pdfAttachment.available, true);
  assert.strictEqual(initial.pdfAttachment.pageCount, 359);
  const second = initial.entries.find((entry) =>
    entry.documentKey.startsWith("json/02 ") && entry.pdfPageNumber);
  assert(second);
  assert.strictEqual(second.pdfPageNumber, second.pageIndex + 201);
  const firstPart = initial.entries.find((entry) => entry.documentKey.startsWith("json/01 "));
  assert.strictEqual(firstPart.pdfPageNumber, firstPart.pageIndex + 1);

  const sidecar = path.join(project, "chapters", "01 卷一", "01 卷一.ocr2md.json");
  const sidecarBytes = fs.readFileSync(sidecar);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1480, height: 910 } });
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(e.message));
  try {
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      document.querySelector("#state-value")?.textContent?.includes("idle"), null, { timeout: 35000 });
    await page.locator("#chapter-select").selectOption(first.id);
    await page.waitForFunction(() =>
      document.querySelector("#chapter-name")?.textContent?.includes("卷一"));
    await page.locator("#chapter-element-tab").click();
    await page.locator('#chapter-element-menu [data-review-module="注释"]').click();
    await page.locator("#mineru-audit-open").waitFor({ state: "visible", timeout: 35000 });
    await page.locator("#mineru-audit-open").click();
    await page.locator("#mineru-audit-workspace").waitFor({ state: "visible" });
    assert.strictEqual(await page.locator("#calibration-grid").isHidden(), true);
    await page.waitForFunction(() =>
      document.querySelector("#mineru-audit-summary")?.textContent?.includes("全书 23 项"),
      null, { timeout: 35000 });
    const headers = await page.locator("#mineru-audit-items .ag-header-cell-text").allTextContents();
    for (const expected of ["原 PDF 页", "来源段", "段内页", "异常类型", "OCR 原文 / 证据", "审核状态"]) {
      assert(headers.some((header) => header.includes(expected)), "Missing audit AG header: " + expected);
    }
    console.log("AG_HEADERS", headers.join(", "));

    await page.locator("#mineru-audit-kind").selectOption("待验证引用");
    await page.waitForFunction(() =>
      document.querySelector("#mineru-audit-summary")?.textContent?.includes("当前筛出 2 项"));
    await page.locator("#mineru-audit-kind").selectOption("未识别页脚");
    await page.waitForFunction(() =>
      document.querySelector("#mineru-audit-summary")?.textContent?.includes("当前筛出 21 项"));
    await page.locator("#mineru-audit-search").fill("2016.11");
    await page.waitForFunction(() =>
      document.querySelector("#mineru-audit-summary")?.textContent?.includes("当前筛出 1 项"));
    const row = page.locator("#mineru-audit-items .ag-row").first();
    await row.click();
    await page.locator("#original-pdf-preview").waitFor({ state: "visible", timeout: 10000 });
    assert.strictEqual(await page.locator("#original-pdf-preview").isVisible(), true);
    assert.strictEqual(await page.locator("#working-editor").isVisible(), true);
    assert.strictEqual(await page.locator("#markdown-preview").isHidden(), true);
    const evidence = await page.locator("#mineru-audit-evidence").textContent();
    assert.match(evidence, /2016\.11/);
    const chosenEntry = initial.entries.find((e) => e.detail.includes("2016.11"));
    const iframeUrl = await page.locator("#original-pdf-frame").getAttribute("src");
    assert(iframeUrl.endsWith("#page=" + chosenEntry.pdfPageNumber));
    assert.match(await page.locator("#original-pdf-page-label").textContent(), /请在上方 MD 工作稿中修正/);
    console.log("AG_PDF_CORRECT_PAGE", chosenEntry.pdfPageNumber, iframeUrl.slice(-22));

    await page.locator("#mineru-audit-decision").selectOption("已核查");
    await page.locator("#mineru-audit-note").fill("已对照原 PDF，该段为印刷日期，暂不修改工作稿。");
    await page.locator("#mineru-audit-save").click();
    await page.waitForFunction(() =>
      document.querySelector("#mineru-audit-summary")?.textContent?.includes("已核查 1"));
    await page.locator("#mineru-audit-close").click();
    assert.strictEqual(await page.locator("#calibration-grid").isVisible(), true);
    await page.locator("#mineru-audit-open").click();
    await page.waitForFunction(() =>
      document.querySelector("#mineru-audit-summary")?.textContent?.includes("已核查 1"));
    await page.locator("#mineru-audit-state").selectOption("已核查");
    await page.locator("#mineru-audit-search").fill("2016.11");
    await page.waitForFunction(() =>
      document.querySelector("#mineru-audit-summary")?.textContent?.includes("当前筛出 1 项"));
    await page.locator("#mineru-audit-items .ag-row").first().click();
    assert.strictEqual(await page.locator("#mineru-audit-note").inputValue(),
      "已对照原 PDF，该段为印刷日期，暂不修改工作稿。");
    console.log("AG_REVIEW_PERSISTED");

    // Second JSON starts at original PDF page 201, not its local page 1.
    await page.locator("#mineru-audit-state").selectOption("");
    await page.locator("#mineru-audit-kind").selectOption(second.kind);
    await page.locator("#mineru-audit-search").fill(second.detail.slice(0, 48));
    await page.waitForFunction(() =>
      document.querySelector("#mineru-audit-summary")?.textContent?.includes("当前筛出 1 项"),
      null, { timeout: 14000 });
    await page.waitForFunction((marker) =>
      document.querySelector("#mineru-audit-items .ag-row")?.textContent?.includes(marker),
      second.detail.slice(0, 16), { timeout: 12000 });
    await page.locator("#mineru-audit-items .ag-row").first().click();
    await page.waitForFunction((pdfPage) =>
      document.querySelector("#original-pdf-frame")?.getAttribute("src")?.endsWith("#page=" + pdfPage),
      second.pdfPageNumber, { timeout: 12000 });
    const secondUrl = await page.locator("#original-pdf-frame").getAttribute("src");
    assert(secondUrl.endsWith("#page=" + second.pdfPageNumber));
    assert(second.pdfPageNumber > 200);
    await page.locator("#original-pdf-close").click();
    assert.strictEqual(await page.locator("#markdown-preview").isVisible(), true);
    assert.strictEqual(await page.locator("#original-pdf-preview").isHidden(), true);
    console.log("AG_JSON2_OFFSET", second.pageIndex + 1, "=>", second.pdfPageNumber);

    // Add a real missing-body issue ONLY inside the /tmp project, then use
    // the AG row's verified MD locator to navigate across chapters.
    const jsonDir = path.join(project, "json");
    const jsonName = fs.readdirSync(jsonDir)
      .find((file) => file.startsWith("01 ") && file.endsWith(".json"));
    assert(jsonName);
    const jsonPath = path.join(jsonDir, jsonName);
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const pdfPage9 = data.pdf_info[8];
    const text = (block) => (block.lines ?? []).flatMap((line) =>
      (line.spans ?? []).map((span) => span.content ?? "")).join("").trim();
    const previous = pdfPage9.discarded_blocks.length;
    pdfPage9.discarded_blocks = pdfPage9.discarded_blocks.filter((block) =>
      block.type !== "page_footnote" || !text(block).startsWith("①"));
    assert.strictEqual(previous - pdfPage9.discarded_blocks.length, 1);
    fs.writeFileSync(jsonPath, JSON.stringify(data));

    await page.locator("#mineru-audit-close").click();
    await page.locator("#chapter-select").selectOption(seventh.id);
    await page.waitForFunction(() =>
      document.querySelector("#chapter-name")?.textContent?.includes("卷七"));
    await page.locator("#chapter-element-tab").click();
    await page.locator('#chapter-element-menu [data-review-module="注释"]').click();
    await page.locator("#mineru-audit-open").waitFor({ state: "visible", timeout: 40000 });
    await page.locator("#mineru-audit-open").click();
    await page.waitForFunction(() =>
      document.querySelector("#mineru-audit-summary")?.textContent?.includes("全书 24 项"),
      null, { timeout: 35000 });
    await page.locator("#mineru-audit-kind").selectOption("注释正文缺失");
    await page.waitForFunction(() =>
      document.querySelector("#mineru-audit-summary")?.textContent?.includes("当前筛出 1 项"));
    await page.locator("#mineru-audit-items .ag-row").first().click();
    await page.locator("#mineru-audit-locate-md").waitFor({ state: "visible" });
    await page.locator("#mineru-audit-locate-md").click();
    await page.waitForFunction(() =>
      document.querySelector("#chapter-name")?.textContent?.includes("卷一"),
      null, { timeout: 30000 });
    await page.waitForFunction(() =>
      document.querySelector("#source-location-status")?.textContent?.includes("审计 · 注释正文缺失"),
      null, { timeout: 30000 });
    assert.match(await page.locator("#source-location-status").textContent(), /MD 第 \d+ 行/);
    console.log("AG_CROSS_CHAPTER_MD_NAV",
      await page.locator("#source-location-status").textContent());

    // Browser/transport checks must not overwrite the existing review sidecar.
    assert(sidecarBytes.equals(fs.readFileSync(sidecar)));
    assert.deepStrictEqual(jsErrors, []);
    console.log("AG_AUDIT_PDF_BROWSER_PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 2;
});
