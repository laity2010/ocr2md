import { expect, type Page } from "@playwright/test";
import type { UiContractStep, UiExpectation, UiInteractionContract } from "./schema";

type UiTestApi = {
  getSourceText(): string;
  getWorkingText(): string;
  setWorkingText(text: string): void;
  ensureReviewRowVisible(text: string, line: number): boolean;
  reviewRowState(text: string, line: number, module?: string): { lineType?: string; owner?: string } | undefined;
};

declare global {
  interface Window {
    __ocr2mdTest?: UiTestApi;
  }
}

function moveLines(text: string, startLine: number, endLine: number, beforeLine: number): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const startIndex = startLine - 1;
  const count = endLine - startLine + 1;
  const beforeIndex = beforeLine - 1;
  const moved = lines.splice(startIndex, count);
  const insertIndex = beforeIndex > startIndex ? beforeIndex - count : beforeIndex;
  lines.splice(insertIndex, 0, ...moved);
  return lines.join(eol);
}

function replaceInLine(text: string, line: number, search: string, replacement: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const index = line - 1;
  if (index < 0 || index >= lines.length) throw new Error(`line out of range: ${line}`);
  if (!lines[index].includes(search)) throw new Error(`text not found at line ${line}: ${search}`);
  lines[index] = lines[index].replace(search, replacement);
  return lines.join(eol);
}

async function waitForUiRefresh(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function performStep(page: Page, step: UiContractStep): Promise<void> {
  if (step.action === "clickSourceLine") {
    const gutter = page.locator("#editor .cm-lineNumbers .cm-gutterElement")
      .filter({ hasText: new RegExp("^" + step.line + "$") })
      .first();
    await expect(gutter).toBeVisible();
    await gutter.click();
    await waitForUiRefresh(page);
    return;
  }

  if (step.action === "clickControl") {
    await page.locator("#" + step.controlId).click();
    await waitForUiRefresh(page);
    return;
  }

  if (step.action === "selectModule") {
    await page.locator(`.module-tag[data-module="${step.module}"]`).click();
    await waitForUiRefresh(page);
    return;
  }

  if (step.action === "setRowLineType") {
    await page.locator(`.module-tag[data-module="${step.module}"]`).click();
    await waitForUiRefresh(page);
    const row = page.getByRole("grid").getByRole("row")
      .filter({ hasText: new RegExp("^\\s*" + step.line + "\\b") })
      .first();
    await expect(row, step.note ?? `${step.module} 缺少第 ${step.line} 行`).toBeVisible();
    const select = row.locator(".line-type-select");
    await expect(select).toBeVisible();
    await select.selectOption(step.value);
    await waitForUiRefresh(page);
    return;
  }

  if (step.action === "pressShortcut") {
    await page.keyboard.press(step.keys);
    await waitForUiRefresh(page);
    return;
  }

  const workingText = await page.evaluate(() => window.__ocr2mdTest!.getWorkingText());
  const nextText = step.action === "moveLines"
    ? moveLines(workingText, step.startLine, step.endLine, step.beforeLine)
    : replaceInLine(workingText, step.line, step.search, step.replace);
  await page.evaluate((text) => window.__ocr2mdTest!.setWorkingText(text), nextText);
  await waitForUiRefresh(page);
}

async function assertExpectation(page: Page, item: UiExpectation): Promise<void> {
  if (item.kind === "workingEqualsMovedSource") {
    const texts = await page.evaluate(() => ({
      source: window.__ocr2mdTest!.getSourceText(),
      working: window.__ocr2mdTest!.getWorkingText(),
    }));
    expect(
      texts.working,
      item.note ?? "working 必须只包含契约规定的行移动",
    ).toBe(moveLines(texts.source, item.startLine, item.endLine, item.beforeLine));
    return;
  }

  if (item.kind === "sourceLineActive") {
    const active = page.locator("#editor .cm-lineNumbers .cm-activeLineGutter");
    await expect(active).toHaveText(String(item.line));
    return;
  }

  if (item.kind === "controlState") {
    const control = page.locator("#" + item.controlId);
    if (item.visible === true) await expect(control).toBeVisible();
    if (item.visible === false) await expect(control).toBeHidden();
    if (item.disabled === true) await expect(control).toBeDisabled();
    if (item.disabled === false) await expect(control).toBeEnabled();
    if (item.text) await expect(control).toContainText(item.text);
    return;
  }

  if (item.kind === "workingEqualsSource") {
    const equal = await page.evaluate(() =>
      window.__ocr2mdTest!.getWorkingText() === window.__ocr2mdTest!.getSourceText());
    expect(equal, item.note ?? "working 必须恢复为 source").toBe(true);
    return;
  }

  if (item.kind === "workingContains") {
    const hasTestApi = await page.evaluate(() => Boolean(window.__ocr2mdTest));
    const working = hasTestApi
      ? await page.evaluate(() => window.__ocr2mdTest!.getWorkingText())
      : await page.locator("#editor .cm-content").innerText();
    expect(working, item.note ?? `working 必须包含：${item.text}`).toContain(item.text);
    return;
  }

  if (item.kind === "moduleActive") {
    const tag = page.locator(`.module-tag[data-module="${item.module}"]`);
    await expect(tag).toHaveClass(/is-active/);
    await expect(tag).toHaveAttribute("aria-selected", "true");
    return;
  }

  if (item.kind === "moduleNotice") {
    const tag = page.locator(`.module-tag[data-module="${item.module}"]`);
    await expect(tag).toContainText(item.text);
    if (item.flashing) await expect(tag).toHaveClass(/has-change-notice/);
    return;
  }

  if (item.kind === "moduleNoticeCleared") {
    const tag = page.locator(`.module-tag[data-module="${item.module}"]`);
    await expect(tag.locator(".module-tag-badge")).toBeHidden();
    await expect(tag).not.toHaveClass(/has-change-notice/);
    return;
  }

  if (item.kind === "featureDebugProgress") {
    const progress = page.locator("#feature-debug-progress");
    await expect(progress, item.note ?? `功能调试状态必须为 ${item.state}`).toHaveAttribute("data-state", item.state, { timeout: 15000 });
    if (item.visible === false) {
      await expect(progress, item.note ?? "功能调试完成后进度面板必须自动收起").toBeHidden();
    } else {
      await expect(progress, item.note ?? "功能调试进度必须可见").toBeVisible();
    }
    if (item.title) await expect(page.locator("#feature-debug-progress-title")).toContainText(item.title);
    if (item.completedSteps !== undefined) {
      const done = page.locator(".feature-debug-progress-step[data-state='done']");
      await expect(done).toHaveCount(item.completedSteps);
    }
    return;
  }

  if (item.kind === "workspaceVisible") {
    const selector = item.workspace === "cleaning" ? "#cleaning-workspace" : "#gd-workspace";
    await expect(page.locator(selector)).toBeVisible();
    return;
  }

  if (item.kind === "reviewRowState") {
    const state = await page.evaluate(
      ({ text, line, module }) => window.__ocr2mdTest?.reviewRowState(text, line, module),
      { text: item.text, line: item.line, module: item.module },
    );
    expect(state, item.note ?? `缺少审核状态：L${item.line} ${item.text}`).toBeTruthy();
    if (item.lineType) expect(state?.lineType).toBe(item.lineType);
    if (item.owner) expect(state?.owner).toBe(item.owner);
    return;
  }

  if (item.kind === "lineTypeOptionAvailable") {
    const moduleTag = page.locator(`.module-tag[data-module="${item.module}"]`);
    if (!(await moduleTag.evaluate((node) => node.classList.contains("is-active")))) {
      await moduleTag.click();
      await waitForUiRefresh(page);
    }
    const select = page.locator(".line-type-select").first();
    await expect(select, item.note ?? `${item.module} 必须存在可编辑行类型`).toBeVisible();
    const options = await select.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLOptionElement).value));
    expect(options, item.note ?? `${item.module} 行类型必须包含 ${item.value}`).toContain(item.value);
    return;
  }

  if (item.kind === "gridLineAbsent") {
    const moduleTag = page.locator(`.module-tag[data-module="${item.module}"]`);
    if (!(await moduleTag.evaluate((node) => node.classList.contains("is-active")))) {
      await moduleTag.click();
      await waitForUiRefresh(page);
    }
    const row = page.getByRole("grid").getByRole("row")
      .filter({ hasText: new RegExp("^\\s*" + item.line + "\\b") });
    await expect(row, item.note ?? `${item.module} 不应出现第 ${item.line} 行`).toHaveCount(0);
    return;
  }

  const moduleTag = page.locator(`.module-tag[data-module="${item.module}"]`);
  if (!(await moduleTag.evaluate((node) => node.classList.contains("is-active")))) {
    await moduleTag.click();
    await waitForUiRefresh(page);
  }

  const hasTestApi = await page.evaluate(() => Boolean(window.__ocr2mdTest));
  if (hasTestApi) {
    const exists = await page.evaluate(
      ({ text, line }) => window.__ocr2mdTest!.ensureReviewRowVisible(text, line),
      { text: item.text, line: item.line },
    );
    expect(exists, `${item.module} 缺少 L${item.line}: ${item.text}`).toBe(true);
    await waitForUiRefresh(page);
  }

  const row = page.getByRole("grid").getByRole("row")
    .filter({ hasText: String(item.line) })
    .filter({ hasText: item.text });

  await expect(row, item.note ?? `缺少 UI 行：${item.module} L${item.line}`).toHaveCount(1);

  if (hasTestApi && (item.change || item.lineType || item.owner)) {
    const state = await page.evaluate(
      ({ text, line, module }) => window.__ocr2mdTest!.reviewRowState(text, line, module),
      { text: item.text, line: item.line, module: item.module },
    );
    expect(state, `缺少行状态：${item.module} L${item.line}`).toBeTruthy();
    if (item.change) expect(state?.lineType).toBe(item.change);
    if (item.lineType) expect(state?.lineType).toBe(item.lineType);
    if (item.owner) expect(state?.owner).toBe(item.owner);
  } else if (!hasTestApi) {
    if (item.lineType) {
      const select = row.locator(".line-type-select").first();
      if (await select.count()) await expect(select).toHaveValue(item.lineType);
      else await expect(row).toContainText(item.lineType);
    }
    if (item.owner) await expect(row).toContainText(item.owner);
  }
  if (item.changed) await expect(row).toHaveClass(/row-changed/);
  if (item.deletedStyle) {
    await expect(row).toHaveClass(/row-deleted-change/);
    const preview = row.locator(".grid-preview-cell").filter({ hasText: item.text }).first();
    await expect(preview).toHaveCSS("text-decoration-line", "line-through");
  }
  if (item.navigable) {
    const preview = row.locator(".grid-preview-cell").filter({ hasText: item.text }).first();
    await preview.click();
    await expect(page.locator("#grid-status")).toContainText(`已定位源码第 ${item.line} 行`);
  }
  if (item.nonNavigable) {
    const preview = row.locator(".grid-preview-cell").filter({ hasText: item.text }).first();
    await preview.click();
    await expect(page.locator("#grid-status")).toContainText("该行已删除，无法定位到工作稿");
  }
}

export async function runUiInteractionContract(page: Page, contract: UiInteractionContract): Promise<void> {
  if (contract.automation !== "browser") throw new Error(`contract is not browser executable: ${contract.id}`);

  if (contract.fixture.mode === "ui-test") {
    await page.goto("/?ui-test=1");
    await page.waitForFunction(() => document.documentElement.dataset.uiTestReady === "true");
    await expect(page.locator("#cleaning-workspace")).toBeVisible();
  } else {
    await page.goto("/");
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true");
    await expect(page.locator("#ui-debug-toggle")).toBeVisible();
    await expect(page.locator("#ui-debug-toggle")).toBeEnabled();
  }

  for (const step of contract.steps) await performStep(page, step);
  for (const item of contract.expectations) await assertExpectation(page, item);
}
