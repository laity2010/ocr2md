import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("review module switch feature debug drives real tabs and never dirties the chapter", async ({ page, request }) => {
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
      response.json() as Promise<{ revision: string; workingText: string }>,
    );

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();

  const action = page.locator("#ui-debug-review-module-switch");
  await expect(action).toBeDisabled();
  await page.locator("#ui-debug-initialize").click();

  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "true",
  );
  await expect(page.locator("#active-review-module")).toHaveText("章节标题");

  await page.evaluate(() => {
    type Snapshot = {
      module: string;
      session: string;
      undo: number;
      redo: number;
      canSave: boolean;
      rows: number;
    };
    const snapshots: Snapshot[] = [];
    const text = (id: string) =>
      document.querySelector<HTMLElement>("#" + id)?.textContent ?? "";
    const capture = () => {
      snapshots.push({
        module: text("active-review-module"),
        session: text("state-value"),
        undo: Number(text("undo-depth")),
        redo: Number(text("redo-depth")),
        canSave: !document.querySelector<HTMLButtonElement>("#save")?.disabled,
        rows: Number(text("active-module-rows")),
      });
    };
    (
      window as typeof window & {
        __reviewModuleSwitchSnapshots?: Snapshot[];
      }
    ).__reviewModuleSwitchSnapshots = snapshots;
    capture();
    new MutationObserver(capture).observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
      attributeFilter: ["aria-pressed", "disabled"],
    });
  });

  await page.locator("#ui-debug-toggle").click();
  await expect(action).toBeEnabled();
  await action.click();

  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "数据表模块切换功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "5/5 通过",
    { timeout: 15_000 },
  );

  const snapshots = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __reviewModuleSwitchSnapshots?: Array<{
            module: string;
            session: string;
            undo: number;
            redo: number;
            canSave: boolean;
            rows: number;
          }>;
        }
      ).__reviewModuleSwitchSnapshots ?? [],
  );

  for (const [module, rows] of [
    ["章节标题", 10],
    ["注释", 20],
    ["嵌入块", 51],
    ["非法断行", 6],
  ] as const) {
    expect(
      snapshots.some(
        (snapshot) =>
          snapshot.module === module
          && snapshot.rows === rows
          && snapshot.session === "chapter-clean"
          && snapshot.undo === 0
          && snapshot.redo === 0
          && !snapshot.canSave,
      ),
    ).toBe(true);
  }

  expect(snapshots.some((snapshot) => snapshot.session === "chapter-dirty")).toBe(
    false,
  );

  await expect(page.locator("#active-review-module")).toHaveText("章节标题");
  await expect(page.locator("#active-module-rows")).toHaveText("10");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#source-location-status")).toContainText(
    "数据表模块切换功能调试通过",
  );

  const current = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{ revision: string; workingText: string }>,
    );
  expect(current.revision).toBe(baseline.revision);
  expect(current.workingText).toBe(baseline.workingText);
  await expect(action).toBeDisabled();
});
