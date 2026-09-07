import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("ignored line type feature debug drives the real AG Grid select and restores baseline", async ({ page, request }) => {
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
      response.json() as Promise<{
        workingText: string;
        revision: string;
      }>,
    );

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();

  const action = page.locator("#ui-debug-ignore-line-type");
  await expect(action).toBeDisabled();
  await page.locator("#ui-debug-initialize").click();

  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "true",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-review-module")).toHaveText("章节标题");
  await expect(page.locator("#save")).toBeDisabled();

  const firstRow = page.locator(
    '#calibration-grid [role="row"]:has(select.calibration-line-type)',
  ).first();
  const targetPreview = (
    await firstRow.locator(".chapter-heading-preview").textContent()
  )?.trim();
  expect(targetPreview).toBeTruthy();

  const baselineActiveRows = Number(
    await page.locator("#active-module-rows").textContent(),
  );
  const baselineVisible = Number(
    await page.locator("#visible-calibration-rows").textContent(),
  );
  const baselineIgnored = Number(
    await page.locator("#ignored-calibration-rows").textContent(),
  );

  await page.evaluate((targetText) => {
    type Snapshot = {
      session: string;
      undo: number;
      redo: number;
      canSave: boolean;
      activeRows: number;
      visible: number;
      ignored: number;
      targetVisible: boolean;
      gridText: string;
    };
    const snapshots: Snapshot[] = [];
    const text = (id: string) =>
      document.querySelector<HTMLElement>("#" + id)?.textContent ?? "";
    const capture = () => {
      const gridText =
        document.querySelector<HTMLElement>("#calibration-grid")?.textContent
        ?? "";
      snapshots.push({
        session: text("state-value"),
        undo: Number(text("undo-depth")),
        redo: Number(text("redo-depth")),
        canSave: !document.querySelector<HTMLButtonElement>("#save")?.disabled,
        activeRows: Number(text("active-module-rows")),
        visible: Number(text("visible-calibration-rows")),
        ignored: Number(text("ignored-calibration-rows")),
        targetVisible: gridText.includes(targetText),
        gridText,
      });
    };
    (
      window as typeof window & {
        __ignoreLineTypeDebugSnapshots?: Snapshot[];
      }
    ).__ignoreLineTypeDebugSnapshots = snapshots;
    capture();
    new MutationObserver(capture).observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
      attributeFilter: ["disabled"],
    });
  }, targetPreview!);

  await page.locator("#ui-debug-toggle").click();
  await expect(action).toBeEnabled();
  await action.click();

  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "行类型：已忽略功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "5/5 通过",
    { timeout: 12_000 },
  );

  const snapshots = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __ignoreLineTypeDebugSnapshots?: Array<{
            session: string;
            undo: number;
            redo: number;
            canSave: boolean;
            activeRows: number;
            visible: number;
            ignored: number;
            targetVisible: boolean;
            gridText: string;
          }>;
        }
      ).__ignoreLineTypeDebugSnapshots ?? [],
  );

  expect(
    snapshots.some(
      (snapshot) =>
        snapshot.session === "chapter-dirty"
        && snapshot.undo === 1
        && snapshot.redo === 0
        && snapshot.canSave
        && snapshot.activeRows === baselineActiveRows - 1
        && snapshot.visible === baselineVisible - 1
        && snapshot.ignored === baselineIgnored + 1
        && !snapshot.targetVisible,
    ),
  ).toBe(true);

  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#active-module-rows")).toHaveText(
    String(baselineActiveRows),
  );
  await expect(page.locator("#visible-calibration-rows")).toHaveText(
    String(baselineVisible),
  );
  await expect(page.locator("#ignored-calibration-rows")).toHaveText(
    String(baselineIgnored),
  );
  await expect(page.locator("#calibration-grid")).toContainText(targetPreview!);
  await expect(page.locator("#source-location-status")).toContainText(
    "行类型：已忽略功能调试通过",
  );

  const current = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{
        workingText: string;
        revision: string;
      }>,
    );

  expect(current.workingText).toBe(baseline.workingText);
  expect(current.revision).toBe(baseline.revision);
  await expect(action).toBeDisabled();
});
