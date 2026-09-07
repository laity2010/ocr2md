import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("calibration grid uses the ocr2md dark theme", async ({ page }) => {
  ensureFeatureDebugCopy();

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();
  await page.locator("#ui-debug-initialize").click();

  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-module-rows")).toHaveText("10");

  const styles = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>("#calibration-grid .ag-row");
    const header = document.querySelector<HTMLElement>("#calibration-grid .ag-header");
    const cell = document.querySelector<HTMLElement>("#calibration-grid .ag-cell");
    const select = document.querySelector<HTMLSelectElement>(
      "#calibration-grid select",
    );
    if (!row || !header || !cell || !select) return null;

    const rowStyle = getComputedStyle(row);
    const headerStyle = getComputedStyle(header);
    const cellStyle = getComputedStyle(cell);
    const selectStyle = getComputedStyle(select);

    return {
      rowBackground: rowStyle.backgroundColor,
      rowColor: rowStyle.color,
      headerBackground: headerStyle.backgroundColor,
      headerColor: headerStyle.color,
      cellColor: cellStyle.color,
      selectBackground: selectStyle.backgroundColor,
      selectColor: selectStyle.color,
    };
  });

  expect(styles).not.toBeNull();
  expect(styles!.rowBackground).not.toBe("rgb(255, 255, 255)");
  expect(styles!.headerBackground).not.toBe("rgb(255, 255, 255)");
  expect(styles!.selectBackground).not.toBe("rgb(255, 255, 255)");
  expect(styles!.rowColor).toBe("rgb(211, 198, 170)");
  expect(styles!.headerColor).toBe("rgb(211, 198, 170)");
  expect(styles!.cellColor).toBe("rgb(211, 198, 170)");
  expect(styles!.selectColor).toBe("rgb(211, 198, 170)");
});
