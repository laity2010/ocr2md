import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("working text feature debug uses real edit path and restores persisted baseline", async ({ page, request }) => {
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

  const action = page.locator("#ui-debug-working-text");
  await expect(action).toBeDisabled();
  await page.locator("#ui-debug-initialize").click();

  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "true",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();

  const baselineLength = Number(
    await page.locator("#working-length").textContent(),
  );

  await page.evaluate(() => {
    type Snapshot = {
      session: string;
      workingLength: number;
      undoDepth: number;
      redoDepth: number;
      canSave: boolean;
      editorText: string;
    };
    const snapshots: Snapshot[] = [];
    const capture = () => {
      const text = (id: string) =>
        document.querySelector<HTMLElement>("#" + id)?.textContent ?? "";
      snapshots.push({
        session: text("state-value"),
        workingLength: Number(text("working-length")),
        undoDepth: Number(text("undo-depth")),
        redoDepth: Number(text("redo-depth")),
        canSave: !document.querySelector<HTMLButtonElement>("#save")?.disabled,
        editorText:
          document.querySelector<HTMLElement>("#working-editor .cm-content")
            ?.textContent ?? "",
      });
    };
    (
      window as typeof window & {
        __workingTextDebugSnapshots?: Snapshot[];
      }
    ).__workingTextDebugSnapshots = snapshots;
    capture();
    new MutationObserver(capture).observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
      attributeFilter: ["disabled"],
    });
  });

  await page.locator("#ui-debug-toggle").click();
  await expect(action).toBeEnabled();
  await action.click();

  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "修改工作稿文本功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "5/5 通过",
    { timeout: 12_000 },
  );

  const snapshots = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __workingTextDebugSnapshots?: Array<{
            session: string;
            workingLength: number;
            undoDepth: number;
            redoDepth: number;
            canSave: boolean;
            editorText: string;
          }>;
        }
      ).__workingTextDebugSnapshots ?? [],
  );

  expect(
    snapshots.some(
      (snapshot) =>
        snapshot.session === "chapter-dirty"
        && snapshot.undoDepth === 1
        && snapshot.redoDepth === 0
        && snapshot.canSave
        && snapshot.workingLength > baselineLength
        && snapshot.editorText.includes("功能调试临时正文"),
    ),
  ).toBe(true);

  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#working-editor .cm-content")).not.toContainText(
    "功能调试临时正文",
  );
  await expect(page.locator("#source-location-status")).toContainText(
    "修改工作稿文本功能调试通过",
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
