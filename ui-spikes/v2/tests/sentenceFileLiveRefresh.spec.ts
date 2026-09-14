import { expect, test } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(
  process.env.OCR2MD_V2_TEST_PROJECT_DIR ?? ".tmp/persistent-project",
);

test("sentence grid refreshes provider json once when entering the sentence module", async ({ page, request }) => {
  test.setTimeout(45_000);
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{ chapters: Array<{ id: string; name: string; ready: boolean }> }>,
  );
  const chapter = catalog.chapters.find((item) => item.ready);
  expect(chapter).toBeTruthy();

  const transDir = path.join(projectDir, "chapters", chapter!.name, "trans");
  const sourcePath = path.join(transDir, `${chapter!.name}.md`);
  const workingPath = path.join(transDir, `${chapter!.name}.working.md`);
  const sentenceDir = path.join(transDir, "sentences");
  const originalPath = path.join(sentenceDir, "original.json");
  const chatgptPath = path.join(sentenceDir, "chatgpt.json");
  const fixture = [
    "# Live translation refresh",
    "<br>",
    "Alpha value rose.",
    "<br>",
  ].join("\n");

  await mkdir(transDir, { recursive: true });
  await writeFile(sourcePath, fixture, "utf8");
  await rm(workingPath, { force: true });
  await rm(sentenceDir, { recursive: true, force: true });

  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");
  await page.locator("#chapter-select").selectOption(`__node_trans_${chapter!.id}__`);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator("#translation-element-tab").click();
  await page.locator('#translation-element-menu [data-review-module="句子"]').click();
  await expect(page.locator('#calibration-grid .ag-header-cell[col-id="sentenceTranslation:chatgpt"]')).toHaveCount(0);

  const source = JSON.parse(await readFile(originalPath, "utf8")) as {
    entries: Array<{
      id: string;
      sourceFingerprint?: string;
      contextFingerprint?: string;
    }>;
  };
  const entry = source.entries.find((item) => item.id.includes("text-block"));
  expect(entry).toBeTruthy();
  await writeFile(chatgptPath, JSON.stringify({
    version: 1,
    provider: "chatgpt",
    label: "ChatGPT",
    sourceFile: "original.json",
    entries: {
      [entry!.id]: {
        sentenceId: entry!.id,
        sourceFingerprint: entry!.sourceFingerprint,
        contextFingerprint: entry!.contextFingerprint,
        translatedText: "外部写入的 GPT 译文",
        status: "translated",
      },
    },
  }, null, 2) + "\n", "utf8");

  const header = page.locator('#calibration-grid .ag-header-cell[col-id="sentenceTranslation:chatgpt"]');
  // Staying in the sentence module does not poll the disk.
  await page.waitForTimeout(4_500);
  await expect(header).toHaveCount(0);

  // Leaving and entering the sentence module performs one fresh disk read.
  await page.locator("#translation-element-tab").click();
  await page.locator('#translation-element-menu [data-review-module="文本块"]').click();
  await page.locator("#translation-element-tab").click();
  await page.locator('#translation-element-menu [data-review-module="句子"]').click();
  await expect(header).toContainText("ChatGPT");
  const translated = page.locator('#calibration-grid [col-id="sentenceTranslation:chatgpt"]')
    .filter({ hasText: "外部写入的 GPT 译文" });
  await expect(translated).toHaveCount(1);
});
