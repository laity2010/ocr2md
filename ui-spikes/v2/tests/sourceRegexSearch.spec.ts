import { expect, test } from "@playwright/test";

test("source regex search navigates CodeMirror without touching business state", async ({ page, request }) => {
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const target = catalog.chapters.find(
    (chapter) => chapter.ready && chapter.name === "01 Buffett’s Alpha",
  );
  expect(target).toBeTruthy();

  const payload = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{ workingText: string }>,
    );

  const insensitiveCount = Array.from(
    payload.workingText.matchAll(/Buffett/gimu),
  ).length;
  expect(insensitiveCount).toBeGreaterThan(1);

  await page.goto("/");
  await page.locator("#chapter-select").selectOption({ label: "chapters/01 Buffett’s Alpha" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const input = page.locator("#regex-search");
  const status = page.locator("#search-status");

  await input.fill("Buffett");
  await expect(status).toHaveText(
    insensitiveCount + " 个匹配 · 1/" + insensitiveCount,
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");

  await page.locator("#search-next").click();
  await expect(status).toHaveText(
    insensitiveCount + " 个匹配 · 2/" + insensitiveCount,
  );

  await page.locator("#search-prev").click();
  await expect(status).toHaveText(
    insensitiveCount + " 个匹配 · 1/" + insensitiveCount,
  );

  await input.fill("[");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(status).toContainText("正则错误：");
  await expect(page.locator("#search-prev")).toBeDisabled();
  await expect(page.locator("#search-next")).toBeDisabled();

  await input.fill("");
  await expect(status).toHaveText("");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
});
