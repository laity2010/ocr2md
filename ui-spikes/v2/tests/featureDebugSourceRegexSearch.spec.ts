import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("source regex search feature debug drives real controls and restores baseline", async ({ page, request }) => {
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
  const matchCount = Array.from(baseline.workingText.matchAll(/Buffett/gimu)).length;
  expect(matchCount).toBeGreaterThan(1);

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();
  await page.locator("#ui-debug-initialize").click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "true",
  );

  await page.evaluate(() => {
    const status = document.querySelector("#search-status");
    const input = document.querySelector("#regex-search");
    const prev = document.querySelector("#search-prev");
    const next = document.querySelector("#search-next");
    if (!status || !input || !prev || !next) {
      throw new Error("search controls missing");
    }
    const samples: Array<{
      status: string;
      invalid: string | null;
      prevDisabled: boolean;
      nextDisabled: boolean;
    }> = [];
    (
      window as typeof window & {
        __regexDebugSamples?: typeof samples;
      }
    ).__regexDebugSamples = samples;
    const capture = () => {
      samples.push({
        status: status.textContent ?? "",
        invalid: input.getAttribute("aria-invalid"),
        prevDisabled: (prev as HTMLButtonElement).disabled,
        nextDisabled: (next as HTMLButtonElement).disabled,
      });
    };
    const observer = new MutationObserver(capture);
    observer.observe(status, { childList: true, subtree: true, characterData: true });
    observer.observe(input, { attributes: true, attributeFilter: ["aria-invalid"] });
    observer.observe(prev, { attributes: true, attributeFilter: ["disabled"] });
    observer.observe(next, { attributes: true, attributeFilter: ["disabled"] });
  });

  await page.locator("#ui-debug-toggle").click();
  const action = page.locator("#ui-debug-source-regex-search");
  await expect(action).toBeEnabled();
  await action.click();

  const progress = page.locator("#feature-debug-progress");
  await expect(progress).not.toBeHidden();
  await expect(progress).toHaveAttribute("open", "");

  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "源码正则搜索功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "6/6 通过",
    { timeout: 12_000 },
  );

  const samples = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __regexDebugSamples?: Array<{
            status: string;
            invalid: string | null;
            prevDisabled: boolean;
            nextDisabled: boolean;
          }>;
        }
      ).__regexDebugSamples ?? [],
  );

  expect(
    samples.some(
      (sample) =>
        sample.status === matchCount + " 个匹配 · 1/" + matchCount
        && !sample.prevDisabled
        && !sample.nextDisabled,
    ),
  ).toBe(true);
  expect(
    samples.some(
      (sample) =>
        sample.status === matchCount + " 个匹配 · 2/" + matchCount,
    ),
  ).toBe(true);
  expect(
    samples.some(
      (sample) =>
        sample.status.startsWith("正则错误：")
        && sample.invalid === "true"
        && sample.prevDisabled
        && sample.nextDisabled,
    ),
  ).toBe(true);

  await expect(page.locator("#regex-search")).toHaveValue("");
  await expect(page.locator("#search-status")).toHaveText("");
  await expect(page.locator("#search-prev")).toBeDisabled();
  await expect(page.locator("#search-next")).toBeDisabled();
  await expect(page.locator("#regex-search")).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();

  await page.waitForTimeout(2_000);
  await expect(progress).not.toBeHidden();
  await expect(progress).not.toHaveAttribute("open", "");
  await page.locator("#feature-debug-progress-summary").click();
  await expect(progress).toHaveAttribute("open", "");
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "6/6 通过",
  );
  await expect(page.locator("#feature-debug-progress-list")).toContainText(
    "非法正则",
  );

  const current = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{ workingText: string; revision: string }>,
    );
  expect(current.workingText).toBe(baseline.workingText);
  expect(current.revision).toBe(baseline.revision);

  await expect(action).toBeDisabled();

  // Re-initializing the safe working draft resets debug availability, but the
  // most recent debug-step history must remain available for review.
  await page.locator("#feature-debug-progress-summary").click();
  await expect(progress).not.toHaveAttribute("open", "");
  await page.locator("#ui-debug-toggle").click();
  await page.locator("#ui-debug-initialize").click();
  await expect(page.locator("#source-location-status")).toContainText(
    "功能调试已初始化",
    { timeout: 12_000 },
  );
  await expect(progress).toBeVisible();
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "6/6 通过",
  );
  await expect(page.locator("#feature-debug-progress-list")).toContainText(
    "非法正则",
  );
});
