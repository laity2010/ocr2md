import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

async function searchSource(page: Parameters<typeof test>[0] extends never ? never : any, pattern: string) {
  await page.locator("#regex-search").fill(pattern);
  await expect(page.locator("#search-status")).not.toHaveText("0 个匹配");
  await page.waitForTimeout(120);
}

test("source editor restores heading link latex and html semantic styles", async ({ page }) => {
  ensureFeatureDebugCopy();

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();
  await page.locator("#ui-debug-initialize").click();

  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator("#regex-search-toggle").click();
  await expect(page.locator("#regex-search-panel")).toBeVisible();

  const h1 = page.locator("#working-editor .cm-line.cm-obsidian-h1").first();
  await expect(h1).toContainText("Buffett");
  const h1Style = await h1.evaluate((node) => {
    const style = getComputedStyle(node);
    return { color: style.color, fontSize: parseFloat(style.fontSize) };
  });
  expect(h1Style.color).toBe("rgb(218, 99, 98)");
  expect(h1Style.fontSize).toBeGreaterThan(20);

  await searchSource(page, "^## Data Sources$");
  const h2 = page.locator("#working-editor .cm-line.cm-obsidian-h2").first();
  await expect(h2).toContainText("Data Sources");
  const h2Style = await h2.evaluate((node) => {
    const style = getComputedStyle(node);
    return { color: style.color, fontSize: parseFloat(style.fontSize) };
  });
  expect(h2Style.color).toBe("rgb(215, 127, 72)");
  expect(h2Style.fontSize).toBeLessThan(h1Style.fontSize);

  await searchSource(page, "https://");
  const linkLine = page.locator("#working-editor .cm-line").filter({
    hasText: "https://",
  }).first();
  await expect(linkLine).toBeVisible();
  const linkTokens = await linkLine.evaluate((node) =>
    Array.from(node.querySelectorAll("span")).map((span) => {
      const style = getComputedStyle(span);
      return {
        text: span.textContent ?? "",
        color: style.color,
        decoration: style.textDecorationLine,
      };
    }),
  );
  expect(
    linkTokens.some((token) =>
      (token.color === "rgb(131, 192, 146)"
        || token.color === "rgb(127, 187, 179)")
      && token.decoration.includes("underline"),
    ),
  ).toBe(true);

  await searchSource(page, "mathsf");
  const latexFunction = page.locator(
    "#working-editor .cm-obsidian-latex-function",
  ).first();
  await expect(latexFunction).toBeVisible();
  await expect(latexFunction).toHaveCSS("color", "rgb(127, 187, 179)");

  await searchSource(page, "<sup>");
  const htmlLine = page.locator("#working-editor .cm-line").filter({
    hasText: "<sup>",
  }).first();
  await expect(htmlLine).toBeVisible();
  const htmlTokenColors = await htmlLine.evaluate((node) =>
    Array.from(node.querySelectorAll("span"))
      .map((span) => getComputedStyle(span).color),
  );
  expect(htmlTokenColors).toContain("rgb(218, 99, 98)");

  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
});
