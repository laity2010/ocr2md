import { expect, test } from "@playwright/test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(
  process.env.OCR2MD_V2_TEST_PROJECT_DIR ?? ".tmp/persistent-project",
);
const privateConfigPath = path.resolve(".tmp/private-config/translation-services.json");

type Snapshot = { existed: boolean; bytes?: Buffer };
async function snapshot(file: string): Promise<Snapshot> {
  try {
    await stat(file);
    return { existed: true, bytes: await readFile(file) };
  } catch {
    return { existed: false };
  }
}
async function restore(file: string, before: Snapshot): Promise<void> {
  if (before.existed) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, before.bytes!);
  } else {
    await rm(file, { force: true });
  }
}

test("translation service workbench keeps keys private and uses real sentence JSON", async ({ page, request }) => {
  test.setTimeout(60_000);
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{ chapters: Array<{ id: string; name: string; ready: boolean }> }>,
  );
  const chapter = catalog.chapters.find((item) => item.ready);
  expect(chapter).toBeTruthy();

  const transDir = path.join(projectDir, "chapters", chapter!.name, "trans");
  const sourcePath = path.join(transDir, `${chapter!.name}.md`);
  const workingPath = path.join(transDir, `${chapter!.name}.working.md`);
  const sentenceDir = path.join(transDir, "sentences");
  const sentenceSourcePath = path.join(sentenceDir, "original.json");
  const deeplPath = path.join(sentenceDir, "deepl.json");
  const chatgptPath = path.join(sentenceDir, "chatgpt.json");
  const sourceBefore = await snapshot(sourcePath);
  const workingBefore = await snapshot(workingPath);
  const configBefore = await snapshot(privateConfigPath);
  const fixture = [
    "# Translation service fixture",
    "<br>",
    "Alpha value $R_t$ rose.[^1]",
    "<br>",
    "[^1]: note",
    "<br>",
  ].join("\n");

  try {
    await mkdir(transDir, { recursive: true });
    await writeFile(sourcePath, fixture, "utf8");
    await rm(workingPath, { force: true });
    await rm(sentenceDir, { recursive: true, force: true });
    await rm(privateConfigPath, { force: true });

    await page.goto("/");
    await expect(page.locator("#state-value")).toHaveText("idle");
    await page.locator("#chapter-select").selectOption(`__node_trans_${chapter!.id}__`);
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");

    await page.locator("#translation-element-tab").click();
    await page.locator('#translation-element-menu [data-review-module="翻译服务"]').click();
    await expect(page.locator("#translation-element-tab")).toHaveText("trans 翻译/翻译服务 ▾");
    const servicePanel = page.locator("#translation-service-panel");
    await expect(servicePanel).toBeVisible();
    await expect(page.locator("#calibration-grid")).toBeHidden();
    await expect(page.locator("#editor-pane")).toBeHidden();
    await expect(page.locator("#workspace-splitter")).toBeHidden();
    await expect(page.locator("#cleaning-workspace")).toHaveClass(/translation-service-layout/);
    const layoutWidths = await page.locator("#cleaning-workspace").evaluate((workspace) => {
      const panel = workspace.querySelector<HTMLElement>("#translation-service-panel");
      return { workspace: workspace.getBoundingClientRect().width, panel: panel?.getBoundingClientRect().width ?? 0 };
    });
    expect(layoutWidths.panel / layoutWidths.workspace).toBeGreaterThan(0.9);
    await expect(page.locator("#translation-service-name")).toHaveText("DeepL");

    await page.locator("#translation-service-next").click();
    await expect(page.locator("#translation-service-original"))
      .toContainText("Alpha value $R_t$ rose.[^1]");
    const sent = page.locator("#translation-service-sent");
    await expect(sent).toContainText('<ocr2md-protected id="p0001"/>');
    await expect(sent).toContainText('<ocr2md-protected id="p0002"/>');
    await expect(sent).not.toContainText("$R_t$");
    await expect(sent).not.toContainText("[^1]");
    const sourceJson = JSON.parse(await readFile(sentenceSourcePath, "utf8")) as {
      entries: Array<{ sourceText: string; translationText: string }>;
    };
    expect(sourceJson.entries.some((entry) => entry.sourceText.includes("Alpha value"))).toBe(true);

    await page.locator("#translation-service-test").click();
    await expect(page.locator("#translation-service-test-status")).toContainText("API Key 未配置");

    await page.route("**/__workspace/translation-services/test", async (route) => {
      await route.fulfill({
        status: 424,
        contentType: "application/json",
        body: JSON.stringify({
          error: "DeepL 429 · 请求过于频繁或当前账号/IP 被限流，请稍后重试",
          providerStatus: 429,
          provider: "deepl",
        }),
      });
    });
    await page.locator("#translation-service-test").click();
    await expect(page.locator("#translation-service-test-status"))
      .toContainText("DeepL 429");
    await expect(page.locator("#translation-service-test-status"))
      .toHaveClass(/is-error/);
    await expect(page.locator("#translation-service-result"))
      .toContainText("请求过于频繁");
    await page.unroute("**/__workspace/translation-services/test");

    let deeplExists = true;
    let chatgptExists = true;
    try { await stat(deeplPath); } catch { deeplExists = false; }
    try { await stat(chatgptPath); } catch { chatgptExists = false; }
    expect(deeplExists).toBe(false);
    expect(chatgptExists).toBe(false);

    await page.locator("#translation-service-api-key").fill("deepl-secret-e2e");
    await page.locator("#translation-service-endpoint").fill("https://api-free.deepl.com");
    await page.locator("#translation-service-source").fill("EN");
    await page.locator("#translation-service-target").fill("ZH-HANS");
    await page.locator("#translation-service-model").fill("prefer_quality_optimized");
    await page.locator("#translation-service-save").click();
    await expect(page.locator("#translation-service-config-status")).toContainText("已保存");
    await expect(page.locator('[data-service-state="deepl"]')).toHaveText("已配置");

    const publicPayload = await request.get("/__workspace/translation-services").then((response) => response.json());
    expect(JSON.stringify(publicPayload)).not.toContain("deepl-secret-e2e");
    expect(publicPayload.services.find((item: { id: string }) => item.id === "deepl").apiKeyConfigured).toBe(true);
    const privatePayload = JSON.parse(await readFile(privateConfigPath, "utf8"));
    expect(privatePayload.services.deepl.apiKey).toBe("deepl-secret-e2e");
    expect(privateConfigPath.startsWith(projectDir)).toBe(false);

    await page.locator('[data-provider="chatgpt"]').click();
    await expect(page.locator("#translation-service-name")).toHaveText("ChatGPT");
    await expect(page.locator("#translation-service-endpoint")).toHaveValue("https://api.openai.com/v1/responses");
    await expect(page.locator("#translation-service-model")).toHaveValue("gpt-5.6-luna");
    await expect(page.locator("#translation-service-instruction-row")).toBeVisible();
    await expect(page.locator("#translation-service-source-row")).toBeHidden();
    await page.locator("#translation-service-api-key").fill("openai-secret-e2e");
    await page.locator("#translation-service-save").click();
    await expect(page.locator("#translation-service-config-status")).toContainText("已保存");

    const publicAfter = await request.get("/__workspace/translation-services").then((response) => response.json());
    expect(JSON.stringify(publicAfter)).not.toContain("openai-secret-e2e");
    expect(publicAfter.services.find((item: { id: string }) => item.id === "chatgpt").apiKeyConfigured).toBe(true);

    await page.locator("#translation-element-tab").click();
    await page.locator('#translation-element-menu [data-review-module="句子"]').click();
    await expect(page.locator("#editor-pane")).toBeVisible();
    await expect(page.locator("#workspace-splitter")).toBeVisible();
    await expect(page.locator("#cleaning-workspace")).not.toHaveClass(/translation-service-layout/);
    await expect(page.locator("#calibration-grid")).toBeVisible();
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");
    await expect(page.locator("#save")).toBeDisabled();
  } finally {
    await restore(sourcePath, sourceBefore);
    await restore(workingPath, workingBefore);
    await restore(privateConfigPath, configBefore);
  }
});

test("sentence toolbar follows selected provider and resumes untranslated sentences", async ({ page, request }) => {
  test.setTimeout(90_000);
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{ chapters: Array<{ id: string; name: string; ready: boolean }> }>,
  );
  const chapter = catalog.chapters.find((item) => item.ready);
  expect(chapter).toBeTruthy();

  const transDir = path.join(projectDir, "chapters", chapter!.name, "trans");
  const sourcePath = path.join(transDir, `${chapter!.name}.md`);
  const workingPath = path.join(transDir, `${chapter!.name}.working.md`);
  const sentenceDir = path.join(transDir, "sentences");
  const sentenceSourcePath = path.join(sentenceDir, "original.json");
  const sourceBefore = await snapshot(sourcePath);
  const workingBefore = await snapshot(workingPath);
  const configBefore = await snapshot(privateConfigPath);
  const fixture = [
    "# Translation batch fixture",
    "<br>",
    "Alpha value $R_t$ rose.[^1]",
    "<br>",
    "Beta sentence is here.",
    "<br>",
    "Gamma sentence is here.",
    "<br>",
    "Delta sentence is here.",
    "<br>",
    "[^1]: note",
    "<br>",
  ].join("\n");
  const privateConfig = {
    version: 1,
    activeProvider: "deepl",
    services: {
      deepl: {
        endpoint: "https://api-free.deepl.com",
        sourceLanguage: "EN",
        targetLanguage: "ZH-HANS",
        model: "",
        apiKey: "deepl-batch-test",
      },
      chatgpt: {
        endpoint: "https://api.openai.com/v1/responses",
        model: "gpt-5.6-luna",
        targetLanguage: "Simplified Chinese",
        instruction: "Translate and preserve protected tokens.",
        apiKey: "chatgpt-batch-test",
      },
    },
  };

  try {
    await mkdir(transDir, { recursive: true });
    await writeFile(sourcePath, fixture, "utf8");
    await rm(workingPath, { force: true });
    await rm(sentenceDir, { recursive: true, force: true });
    await mkdir(path.dirname(privateConfigPath), { recursive: true });
    await writeFile(privateConfigPath, JSON.stringify(privateConfig, null, 2) + "\n", "utf8");

    await page.goto("/");
    await expect(page.locator("#state-value")).toHaveText("idle");
    await page.locator("#chapter-select").selectOption(`__node_trans_${chapter!.id}__`);
    await expect(page.locator("#state-value")).toHaveText("chapter-clean");

    await page.locator("#translation-element-tab").click();
    await page.locator('#translation-element-menu [data-review-module="句子"]').click();
    await expect(page.locator("#sentence-translate-toolbar")).toBeVisible();
    await expect(page.locator("#sentence-translate-button")).toHaveText("DeepL 翻译");
    await expect(page.locator("#review-grid-status")).toContainText("DeepL");
    await expect(page.locator("#review-grid-status")).toContainText("已翻 0/");

    const deeplSourceJson = JSON.parse(await readFile(sentenceSourcePath, "utf8")) as {
      entries: Array<{ id: string; sourceText: string }>;
    };
    const deeplIds = deeplSourceJson.entries.map((entry) => entry.id);
    const deeplEntries: Record<string, Record<string, unknown>> = {};
    const deeplBatchCalls: string[][] = [];
    await page.route("**/__workspace/translation-services/translate-batch", async (route) => {
      const body = route.request().postDataJSON() as {
        provider: string;
        sentenceIds: string[];
      };
      expect(body.provider).toBe("deepl");
      deeplBatchCalls.push(body.sentenceIds);
      for (const id of body.sentenceIds) {
        deeplEntries[id] = {
          sentenceId: id,
          status: "translated",
          translatedText: `DeepL 译文 ${id}`,
          updatedAt: new Date().toISOString(),
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          provider: "deepl",
          sentenceIds: body.sentenceIds,
          translatedCount: body.sentenceIds.length,
          failedCount: 0,
          contextCharacters: 512,
          translationFile: {
            fileName: "deepl.json",
            provider: "deepl",
            data: {
              version: 1,
              provider: "deepl",
              label: "DeepL",
              sourceFile: "original.json",
              entries: deeplEntries,
            },
          },
        }),
      });
    });
    await page.locator("#sentence-translate-button").click();
    await expect(page.locator("#review-grid-status"))
      .toContainText(`已翻 ${deeplIds.length}/${deeplIds.length}`);
    expect(deeplBatchCalls).toHaveLength(1);
    expect(deeplBatchCalls[0]).toEqual(deeplIds);
    await page.unroute("**/__workspace/translation-services/translate-batch");

    await page.locator("#translation-element-tab").click();
    await page.locator('#translation-element-menu [data-review-module="翻译服务"]').click();
    await page.locator('[data-provider="chatgpt"]').click();
    await expect.poll(async () => {
      const payload = await request.get("/__workspace/translation-services").then((response) => response.json());
      return payload.activeProvider;
    }).toBe("chatgpt");

    await page.locator("#translation-element-tab").click();
    await page.locator('#translation-element-menu [data-review-module="句子"]').click();
    await expect(page.locator("#sentence-translate-button")).toHaveText("ChatGPT 翻译");
    await expect(page.locator("#review-grid-status")).toContainText("ChatGPT");
    await expect(page.locator("#review-grid-status")).toContainText("已配置");

    const sourceJson = JSON.parse(await readFile(sentenceSourcePath, "utf8")) as {
      entries: Array<{ id: string; sourceText: string }>;
    };
    expect(sourceJson.entries.length).toBeGreaterThanOrEqual(4);
    const ids = sourceJson.entries.map((entry) => entry.id);
    const calls: string[] = [];
    const translatedEntries: Record<string, Record<string, unknown>> = {};
    let failSecondOnce = true;

    await page.route("**/__workspace/translation-services/translate-sentence", async (route) => {
      const body = route.request().postDataJSON() as { provider: string; sentenceId: string };
      expect(body.provider).toBe("chatgpt");
      calls.push(body.sentenceId);
      const isSecond = body.sentenceId === ids[1];
      if (isSecond && failSecondOnce) {
        failSecondOnce = false;
        translatedEntries[body.sentenceId] = {
          sentenceId: body.sentenceId,
          status: "error",
          error: "synthetic provider failure",
          updatedAt: new Date().toISOString(),
        };
        await route.fulfill({
          status: 424,
          contentType: "application/json",
          body: JSON.stringify({
            error: "ChatGPT · synthetic provider failure",
            provider: "chatgpt",
            sentenceId: body.sentenceId,
            translationFile: {
              fileName: "chatgpt.json",
              provider: "chatgpt",
              data: {
                version: 1,
                provider: "chatgpt",
                label: "ChatGPT",
                sourceFile: "original.json",
                entries: translatedEntries,
              },
            },
          }),
        });
        return;
      }
      translatedEntries[body.sentenceId] = {
        sentenceId: body.sentenceId,
        status: "translated",
        translatedText: `译文 ${body.sentenceId}`,
        updatedAt: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          provider: "chatgpt",
          sentenceId: body.sentenceId,
          translatedText: translatedEntries[body.sentenceId].translatedText,
          placeholderIntegrity: true,
          missingPlaceholders: [],
          unexpectedPlaceholders: [],
          durationMs: 10,
          translationFile: {
            fileName: "chatgpt.json",
            provider: "chatgpt",
            data: {
              version: 1,
              provider: "chatgpt",
              label: "ChatGPT",
              sourceFile: "original.json",
              entries: translatedEntries,
            },
          },
        }),
      });
    });

    await page.locator("#sentence-translate-button").click();
    await expect(page.locator("#review-grid-status")).toContainText("已翻 1/");
    await expect(page.locator("#review-grid-status")).toContainText("失败 · ChatGPT · synthetic provider failure");
    await expect(page.locator("#sentence-translate-button")).toBeEnabled();
    await expect(page.locator('.ag-header-cell-text')).toContainText(["ChatGPT"]);
    expect(calls.slice(0, 2)).toEqual(ids.slice(0, 2));

    await page.locator("#sentence-translate-button").click();
    await expect(page.locator("#review-grid-status")).toContainText(`已翻 ${ids.length}/${ids.length}`);
    await expect(page.locator("#review-grid-status")).toContainText("已完成");
    await expect(page.locator("#sentence-translate-button")).toBeDisabled();

    expect(calls.filter((id) => id === ids[0])).toHaveLength(1);
    expect(calls.filter((id) => id === ids[1])).toHaveLength(2);
    for (const id of ids.slice(2)) {
      expect(calls.filter((item) => item === id)).toHaveLength(1);
    }
  } finally {
    await page.unroute("**/__workspace/translation-services/translate-sentence");
    await restore(sourcePath, sourceBefore);
    await restore(workingPath, workingBefore);
    await restore(privateConfigPath, configBefore);
  }
});
