/* WP6 review workflow on a dedicated /tmp copy of the actual Confessions project.
 * Never run with the live iCloud project; the test intentionally edits the copy. */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

async function main() {
  const base = process.env.OCR2MD_WP6_BASE_URL;
  const project = process.env.OCR2MD_WP6_PROJECT;
  const reviews = process.env.OCR2MD_MINERU_AUDIT_REVIEW_DIR;
  if (!base || !project?.startsWith("/tmp/ocr2md-wp6-smoke-") || !reviews?.startsWith("/tmp/ocr2md-wp6-smoke-")) {
    throw Error("A dedicated /tmp WP6 test project and review dir are required");
  }
  const catalogResponse = await fetch(base + "/__workspace/chapters");
  assert.strictEqual(catalogResponse.status, 200);
  const { chapters } = await catalogResponse.json();
  const first = chapters.find((item) => item.name === "01 卷一");
  const seventh = chapters.find((item) => item.name === "07 卷七");
  assert.ok(first?.id && seventh?.id);
  const url = base + "/__workspace/chapter/annotation-audit?chapterId=" + first.id;
  const initialResponse = await fetch(url);
  assert.strictEqual(initialResponse.status, 200);
  const initial = await initialResponse.json();
  assert.deepStrictEqual(initial.counts, {
    "待审核": 23, "已核查": 0, "疑似误报": 0, "需复核": 0,
  });
  assert.strictEqual(initial.entries.length, 23);
  assert.strictEqual(initial.kinds["未识别页脚"], 21);
  assert.strictEqual(initial.kinds["待验证引用"], 2);
  console.log("AUDIT_API", JSON.stringify(initial.counts));

  const sidecar = path.join(project, "chapters", "01 卷一", "01 卷一.ocr2md.json");
  const sidecarBefore = fs.readFileSync(sidecar);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1330, height: 870 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector("#state-value")?.textContent?.includes("idle"),
      null, { timeout: 35000 },
    );
    await page.locator("#chapter-select").selectOption(first.id);
    await page.waitForFunction(() => document.querySelector("#chapter-name")?.textContent?.includes("卷一"));
    await page.locator("#chapter-element-tab").click();
    await page.locator('#chapter-element-menu [data-review-module="注释"]').click();
    await page.locator("#mineru-audit-open").waitFor({ state: "visible", timeout: 35000 });
    await page.waitForFunction(() => document.querySelector("#mineru-audit-open")?.textContent?.includes("(23)"), { timeout: 35000 });
    await page.locator("#mineru-audit-open").click();
    await page.waitForFunction(() => document.querySelector("#mineru-audit-summary")?.textContent?.includes("全书 23 项"), { timeout: 35000 });
    assert.strictEqual(await page.locator(".mineru-audit-item").count(), 23);

    await page.locator("#mineru-audit-kind").selectOption("待验证引用");
    assert.strictEqual(await page.locator(".mineru-audit-item").count(), 2);
    await page.locator("#mineru-audit-kind").selectOption("未识别页脚");
    assert.strictEqual(await page.locator(".mineru-audit-item").count(), 21);
    await page.locator("#mineru-audit-search").fill("2016.11");
    await page.waitForFunction(
      () => document.querySelectorAll(".mineru-audit-item").length === 1,
      null, { timeout: 12000 },
    );
    assert.strictEqual(await page.locator(".mineru-audit-item").count(), 1);

    const item = page.locator(".mineru-audit-item").first();
    assert.match(await item.locator(".mineru-audit-evidence").textContent(), /2016\.11/);
    await item.locator('select[aria-label="审核结论"]').selectOption("已核查");
    await item.locator('textarea[aria-label="审核备注"]').fill("页面印刷日期，不是真实页注释。");
    await item.getByRole("button", { name: "保存审核" }).click();
    await page.waitForFunction(() => document.querySelector("#mineru-audit-summary")?.textContent?.includes("已核查 1"));
    await page.locator("#mineru-audit-close").click();
    await page.waitForFunction(() => document.querySelector("#mineru-audit-open")?.textContent?.includes("(22)"));

    await page.locator("#mineru-audit-open").click();
    await page.waitForFunction(() => document.querySelector("#mineru-audit-summary")?.textContent?.includes("已核查 1"));
    await page.locator("#mineru-audit-state").selectOption("已核查");
    await page.locator("#mineru-audit-search").fill("2016.11");
    await page.waitForFunction(
      () => document.querySelectorAll(".mineru-audit-item").length === 1,
      null, { timeout: 12000 },
    );
    assert.strictEqual(await page.locator(".mineru-audit-item").count(), 1);
    assert.strictEqual(await page.locator(".mineru-audit-item textarea").inputValue(), "页面印刷日期，不是真实页注释。");
    const approved = await fetch(url).then((r) => r.json());
    assert.strictEqual(approved.counts["已核查"], 1);
    assert.strictEqual(approved.revision, 1);
    console.log("AUDIT_SAVED", JSON.stringify(approved.counts));

    const chapterOriginal = path.join(project, "chapters", "01 卷一", "01 卷一.md");
    fs.appendFileSync(chapterOriginal, "\n");
    await page.locator("#mineru-audit-close").click();
    await page.locator("#mineru-audit-open").click();
    await page.waitForFunction(() => document.querySelector("#mineru-audit-summary")?.textContent?.includes("需复核 1"));
    await page.locator("#mineru-audit-state").selectOption("需复核");
    const staleIssue = page.locator(".mineru-audit-item").first();
    await staleIssue.waitFor();
    assert.match(await staleIssue.textContent(), /上次结论（已核查）已失效/);
    assert.strictEqual(await staleIssue.locator("textarea").inputValue(), "页面印刷日期，不是真实页注释。");
    const afterEdit = await fetch(url).then((r) => r.json());
    assert.strictEqual(afterEdit.counts["需复核"], 1);
    const staleChange = {
      id: approved.entries.find((issue) => issue.state === "已核查").id,
      decision: "疑似误报",
      note: "Old proof",
      expectedRevision: approved.revision,
      sourceFingerprint: approved.sourceFingerprint,
      expectedProjectId: approved.projectId,
    };
    const stalePost = await fetch(base + "/__workspace/chapter/annotation-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterId: first.id, change: staleChange }),
    });
    assert.strictEqual(stalePost.status, 409, "changed evidence must reject old fingerprint");
    const crossProjectPost = await fetch(base + "/__workspace/chapter/annotation-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapterId: first.id,
        change: { ...staleChange, sourceFingerprint: afterEdit.sourceFingerprint, expectedProjectId: "other-project" },
      }),
    });
    assert.strictEqual(crossProjectPost.status, 409, "different-project review must be rejected");
    console.log("STALE_AND_CROSS_PROJECT_REJECTED", stalePost.status, crossProjectPost.status);

    await page.locator("#mineru-audit-close").click();
    // Induce an actual located missing-body issue *only in the /tmp copy*.
    // This verifies navigation from the global audit panel into another chapter.
    const jsonDir = path.join(project, "json");
    const jsonFile = fs.readdirSync(jsonDir).filter((file) => file.startsWith("01 ") && file.endsWith(".json"))[0];
    const jsonPath = path.join(jsonDir, jsonFile);
    const mineru = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const page8 = mineru.pdf_info[8];
    const content = (block) => (block.lines ?? []).flatMap((line) =>
      (line.spans ?? []).map((span) => span.content ?? "")).join("").trim();
    const before = page8.discarded_blocks.length;
    page8.discarded_blocks = page8.discarded_blocks.filter((block) =>
      block.type !== "page_footnote" || !content(block).startsWith("①"));
    assert.strictEqual(before - page8.discarded_blocks.length, 1);
    fs.writeFileSync(jsonPath, JSON.stringify(mineru));
    await page.locator("#chapter-select").selectOption(seventh.id);
    await page.waitForFunction(() => document.querySelector("#chapter-name")?.textContent?.includes("卷七"));
    await page.locator("#chapter-element-tab").click();
    await page.locator('#chapter-element-menu [data-review-module="注释"]').click();
    await page.locator("#mineru-audit-open").waitFor({ state: "visible", timeout: 40000 });
    await page.locator("#mineru-audit-open").click();
    await page.waitForFunction(() => document.querySelector("#mineru-audit-summary")?.textContent?.includes("全书 24 项"), { timeout: 40000 });
    await page.locator("#mineru-audit-state").selectOption("");
    await page.locator("#mineru-audit-kind").selectOption("注释正文缺失");
    assert.strictEqual(await page.locator(".mineru-audit-item").count(), 1);
    const locator = page.locator(".mineru-audit-item").first();
    assert.match(await locator.textContent(), /第 9 页/);
    await locator.getByRole("button", { name: "定位" }).click();
    await page.waitForFunction(() => document.querySelector("#chapter-name")?.textContent?.includes("卷一"), { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector("#source-location-status")?.textContent?.includes("审计 · 注释正文缺失"), { timeout: 30000 });
    assert.match(await page.locator("#source-location-status").textContent(), /MD 第 \d+ 行/);
    console.log("AUDIT_CROSS_CHAPTER_NAV", await page.locator("#source-location-status").textContent());

    assert.ok(sidecarBefore.equals(fs.readFileSync(sidecar)));
    assert.deepStrictEqual(errors, []);
    console.log("WP6_AUDIT_BROWSER_PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 2;
});
