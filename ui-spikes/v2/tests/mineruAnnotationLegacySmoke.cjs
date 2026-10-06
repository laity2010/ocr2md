/* Browser guard for projects without MinerU JSON.
 * Launch against an isolated temporary project with one .working.md. */
const { chromium } = require("@playwright/test");

async function main() {
  const base = process.env.OCR2MD_V2_REAL_BASE_URL;
  if (!base) throw new Error("OCR2MD_V2_REAL_BASE_URL required");
  const catalog = await fetch(base + "/__workspace/chapters").then((r) => r.json());
  const chapter = catalog.chapters.find((entry) => entry.ready);
  if (!chapter?.id) throw new Error("Legacy fixture needs a ready chapter");

  const endpoint = await fetch(
    base + "/__workspace/chapter/annotations?chapterId=" + encodeURIComponent(chapter.id),
  ).then((r) => r.json());
  if (endpoint.available !== false || endpoint.rows.length !== 0) {
    throw new Error("JSON-free project must retain legacy annotation source");
  }

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector("#state-value")?.textContent?.includes("idle"),
      null,
      { timeout: 20000 },
    );
    await page.locator("#chapter-select").selectOption(chapter.id);
    await page.waitForFunction(
      () => document.querySelector("#chapter-name")?.textContent?.includes("Legacy"),
      null,
      { timeout: 20000 },
    );
    await page.locator("#chapter-element-tab").click();
    await page.locator('#chapter-element-menu [data-review-module="注释"]').click();
    await page.waitForFunction(
      () => document.querySelector("#active-review-module")?.textContent === "注释"
        && !(document.querySelector("#review-grid-status")?.textContent ?? "")
          .includes("正在读取页注释"),
      null,
      { timeout: 30000 },
    );
    const headers = await page.locator("#calibration-grid .ag-header-cell-text").allTextContents();
    const status = await page.locator("#review-grid-status").textContent();
    console.log("LEGACY", JSON.stringify({ headers, status, errors }));
    if (headers.length !== 5 ||
      !headers.includes("注释号") || !headers.includes("配对状态") ||
      headers.includes("PDF页") || headers.includes("MD行号") ||
      status?.includes("JSON 页注释") || errors.length) {
      throw new Error("Legacy annotation grid was changed");
    }
    console.log("WP5_LEGACY_BROWSER_PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 2;
});
