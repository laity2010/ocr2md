import { closeChapter } from "./productActions";
import { expect, test } from "@playwright/test";
import { rm } from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(
  process.env.OCR2MD_V2_TEST_PROJECT_DIR ?? ".tmp/persistent-project",
);

async function cleanupBoundaryFixture(): Promise<void> {
  await Promise.all([
    rm(path.join(projectDir, ".ocr2md-merged.working.md"), { force: true }),
    rm(path.join(projectDir, ".ocr2md", "chapter-boundary"), {
      recursive: true,
      force: true,
    }),
    ...["91 One", "92 Two", "93 Three"].map((name) =>
      rm(path.join(projectDir, "chapters", name), {
        recursive: true,
        force: true,
      })),
  ]);
}

test.afterEach(async () => {
  await cleanupBoundaryFixture();
});

test("chapter boundary merges OCR inputs, assigns files, survives history/save, and exports chapters", async ({
  page,
  request,
}) => {
  await cleanupBoundaryFixture();

  const boundaryResponse = await request.get("/__workspace/boundary");
  expect(boundaryResponse.ok()).toBe(true);
  const boundaryPayload = await boundaryResponse.json() as {
    rootMarkdown: Array<{ name: string; text: string }>;
    workingText?: string;
  };
  expect(boundaryPayload.rootMarkdown.map((item) => item.name)).toEqual([
    "OCR_00001.md",
    "OCR_00002.md",
    "OCR_00010.md",
    "already-split.md",
  ]);
  expect(boundaryPayload.workingText).toBeUndefined();

  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  await expect(page.locator("#boundary-selection-status")).toHaveText(
    "OCR 输入 3 个 · 可打开章节定界",
  );
  const navigation = page.locator("#chapter-select");
  await expect(
    navigation.locator('option[value="__node_ocr__"]'),
  ).toBeEnabled();

  await navigation.selectOption("__node_ocr__");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#chapter-name")).toHaveText(
    ".ocr2md-merged.working.md",
  );
  await expect(page.locator("#active-review-module")).toHaveText("章节定界");
  await expect(page.locator("#active-module-rows")).toHaveText("3");
  await expect(page.locator("#boundary-status")).toHaveText(
    "OCR 3 · 一级标题 3 · 已分配 0 · segments 0",
  );
  await expect(page.locator("#boundary-toolbar")).toBeVisible();
  await expect(page.locator('[data-review-module="章节标题"]')).toBeHidden();

  const ensuredResponse = await request.get("/__workspace/boundary");
  const ensured = await ensuredResponse.json() as {
    workingText?: string;
    baselineText?: string;
    sidecar?: { schemaVersion?: number; sourceFile?: string };
    revision: string;
  };
  expect(ensured.workingText).toContain("# One");
  expect(ensured.baselineText).toBe(ensured.workingText);
  expect(ensured.sidecar).toMatchObject({
    schemaVersion: 4,
    sourceFile: ".ocr2md-merged.working.md",
  });
  await expect(page.locator("#revision")).toHaveText(
    ensured.revision.slice(0, 16),
  );

  const editor = page.locator("#working-editor .cm-content");
  await expect(editor).toContainText("# One");
  await expect(editor).toContainText("# Two");
  await expect(editor).toContainText("# Three");
  const mergedText = await editor.innerText();
  expect(mergedText.indexOf("# One")).toBeLessThan(mergedText.indexOf("# Two"));
  expect(mergedText.indexOf("# Two")).toBeLessThan(mergedText.indexOf("# Three"));
  expect(mergedText).not.toContain("Existing chapter");

  const chapterInputs = page.locator(
    "#calibration-grid input.chapter-file-input",
  );
  await expect(chapterInputs).toHaveCount(3);
  await expect(page.locator("#export-boundary")).toBeDisabled();

  await page.locator("#boundary-sequence-start").fill("91");
  await page.locator("#assign-boundary-sequence").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#undo-depth")).toHaveText("1");
  await expect(chapterInputs.nth(0)).toHaveValue("91 One.md");
  await expect(chapterInputs.nth(1)).toHaveValue("92 Two.md");
  await expect(chapterInputs.nth(2)).toHaveValue("93 Three.md");
  await expect(page.locator("#boundary-status")).toHaveText(
    "OCR 3 · 一级标题 3 · 已分配 3 · segments 3",
  );
  await expect(page.locator("#export-boundary")).toBeEnabled();

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(chapterInputs.nth(0)).toHaveValue("");
  await expect(chapterInputs.nth(1)).toHaveValue("");
  await expect(chapterInputs.nth(2)).toHaveValue("");
  await expect(page.locator("#redo-depth")).toHaveText("1");
  await expect(page.locator("#export-boundary")).toBeDisabled();

  await page.locator("#redo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(chapterInputs.nth(0)).toHaveValue("91 One.md");
  await expect(chapterInputs.nth(1)).toHaveValue("92 Two.md");
  await expect(chapterInputs.nth(2)).toHaveValue("93 Three.md");

  const beforeSaveRevision =
    (await page.locator("#revision").textContent())?.trim();
  await page.locator("#save").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  const savedRevision = (await page.locator("#revision").textContent())?.trim();
  expect(savedRevision).toBeTruthy();
  expect(savedRevision).not.toBe(beforeSaveRevision);

  await closeChapter(page);
  await expect(page.locator("#state-value")).toHaveText("idle");
  await navigation.selectOption("__node_ocr__");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#boundary-status")).toHaveText(
    "OCR 3 · 一级标题 3 · 已分配 3 · segments 3",
  );
  await expect(chapterInputs.nth(0)).toHaveValue("91 One.md");
  await expect(chapterInputs.nth(1)).toHaveValue("92 Two.md");
  await expect(chapterInputs.nth(2)).toHaveValue("93 Three.md");

  await page.locator("#export-boundary").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#boundary-export-status")).toContainText(
    "上次导出 3 章",
  );

  for (const name of ["91 One", "92 Two", "93 Three"]) {
    const chapter = path.join(projectDir, "chapters", name, `${name}.md`);
    const working = path.join(
      projectDir,
      "chapters",
      name,
      `${name}.working.md`,
    );
    const sidecar = path.join(
      projectDir,
      "chapters",
      name,
      `${name}.ocr2md.json`,
    );
    const { readFile } = await import("node:fs/promises");
    const [chapterText, workingText, sidecarText] = await Promise.all([
      readFile(chapter, "utf8"),
      readFile(working, "utf8"),
      readFile(sidecar, "utf8"),
    ]);
    expect(chapterText).toContain("ocr2md_chapter_split: true");
    expect(chapterText).toContain(
      'ocr2md_chapter_source: ".ocr2md-merged.working.md"',
    );
    expect(workingText).toBe(chapterText);
    const parsedSidecar = JSON.parse(sidecarText) as {
      schemaVersion: number;
      sourceFile: string;
      annotations: unknown[];
    };
    expect(parsedSidecar.schemaVersion).toBe(4);
    expect(parsedSidecar.sourceFile).toBe(`${name}.md`);
    expect(parsedSidecar.annotations).toEqual([]);
  }

  const exportedCatalogResponse = await request.get("/__workspace/chapters");
  const exportedCatalog = await exportedCatalogResponse.json() as {
    chapters: Array<{ name: string; ready: boolean; reason?: string }>;
  };
  for (const name of ["91 One", "92 Two", "93 Three"]) {
    expect(
      exportedCatalog.chapters.find((item) => item.name === name),
    ).toMatchObject({ name, ready: true });
  }

  await closeChapter(page);
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#refresh-catalog").click();
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#chapter-select").selectOption({ label: "chapters/91 One" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#chapter-name")).toHaveText("91 One.md");
  await expect(page.locator("#active-review-module")).toHaveText("章节标题");
  await expect(page.locator("#active-module-rows")).toHaveText("1");

  const chapterOne = await import("node:fs/promises").then(({ readFile }) =>
    readFile(path.join(projectDir, "chapters", "91 One", "91 One.md"), "utf8"),
  );
  const chapterTwo = await import("node:fs/promises").then(({ readFile }) =>
    readFile(path.join(projectDir, "chapters", "92 Two", "92 Two.md"), "utf8"),
  );
  const chapterThree = await import("node:fs/promises").then(({ readFile }) =>
    readFile(path.join(projectDir, "chapters", "93 Three", "93 Three.md"), "utf8"),
  );
  expect(chapterOne).toContain("# One\nFirst body.");
  expect(chapterOne).not.toContain("# Two");
  expect(chapterTwo).toContain("# Two\nSecond body.");
  expect(chapterTwo).not.toContain("# Three");
  expect(chapterThree).toContain("# Three\nThird body.");
});
