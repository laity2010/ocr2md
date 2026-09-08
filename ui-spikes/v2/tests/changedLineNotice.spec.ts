import { expect, test } from "@playwright/test";

test("changed-line notice tracks unseen live diffs and clears on visit", async ({ page, request }) => {
  const catalog = await (await request.get("/__workspace/chapters")).json() as {
    chapters: Array<{ id: string; name: string; ready: boolean }>;
  };
  const chapter = catalog.chapters.find(
    (item) => item.ready && item.name === "01 Buffett’s Alpha",
  );
  expect(chapter).toBeTruthy();

  const baseline = await (
    await request.get(
      "/__workspace/chapter?chapterId=" + encodeURIComponent(chapter!.id),
    )
  ).json() as {
    workingText: string;
    sidecar: unknown;
    revision: string;
  };

  await page.goto("/");
  await page.locator("#chapter-select").selectOption(chapter!.id);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const changedTab = page.locator('[data-review-module="变动行"]');
  await expect(changedTab).not.toHaveAttribute("data-change-notice", /.+/);

  await changedTab.click();
  const baselineCount = Number(await page.locator("#active-module-rows").textContent());
  expect(baselineCount).toBeGreaterThan(0);
  await page.locator('[data-review-module="章节标题"]').click();

  const editor = page.locator("#working-editor .cm-content");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Q");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(changedTab).toHaveAttribute("data-change-notice", /^\+\d+$/);
  const firstNotice = await changedTab.getAttribute("data-change-notice");
  expect(Number(firstNotice?.slice(1))).toBeGreaterThan(0);

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(changedTab).not.toHaveAttribute("data-change-notice", /.+/);

  await page.locator("#redo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(changedTab).toHaveAttribute("data-change-notice", /^\+\d+$/);

  await changedTab.click();
  await expect(page.locator("#active-review-module")).toHaveText("变动行");
  await expect(changedTab).not.toHaveAttribute("data-change-notice", /.+/);
  const changedCount = Number(await page.locator("#active-module-rows").textContent());
  expect(changedCount).toBeGreaterThanOrEqual(baselineCount);

  await page.locator('[data-review-module="章节标题"]').click();
  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator("#redo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(changedTab).toHaveAttribute("data-change-notice", /^\+\d+$/);

  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(
    changedTab,
    "save must not mark unseen working-vs-original diffs as read",
  ).toHaveAttribute("data-change-notice", /^\+\d+$/);

  await changedTab.click();
  await expect(changedTab).not.toHaveAttribute("data-change-notice", /.+/);

  await page.locator("#close").click();
  await expect(page.locator("#state-value")).toHaveText("idle");
  const current = await (
    await request.get(
      "/__workspace/chapter?chapterId=" + encodeURIComponent(chapter!.id),
    )
  ).json() as { revision: string };
  const restore = await request.post("/__workspace/chapter", {
    data: {
      chapterId: chapter!.id,
      expectedRevision: current.revision,
      workingText: baseline.workingText,
      sidecar: baseline.sidecar,
    },
  });
  expect(restore.ok()).toBe(true);
  const restored = await restore.json() as { revision: string };
  expect(restored.revision).toBe(baseline.revision);
});
