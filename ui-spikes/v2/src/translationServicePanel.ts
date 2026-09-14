import type { ChapterWorkspaceData } from "./chapterRepository";
import type { SentenceSourceEntry } from "../../../src/sentenceFiles";

export type TranslationProviderId = "deepl" | "chatgpt";

export type TranslationServiceSelection = {
  id: TranslationProviderId;
  label: string;
  apiKeyConfigured: boolean;
};

type TranslationServicePublic = {
  id: TranslationProviderId;
  label: string;
  endpoint: string;
  apiKeyConfigured: boolean;
  sourceLanguage?: string;
  targetLanguage?: string;
  model?: string;
  instruction?: string;
};

type TranslationServicesPayload = {
  version: number;
  activeProvider?: TranslationProviderId;
  services: TranslationServicePublic[];
};

type TranslationTestResult = {
  provider: TranslationProviderId;
  sourceText: string;
  translationText: string;
  translatedText: string;
  durationMs: number;
  placeholderIntegrity: boolean;
  missingPlaceholders: string[];
  unexpectedPlaceholders: string[];
};

export class TranslationServicePanel {
  private chapter?: ChapterWorkspaceData;
  private sentences: SentenceSourceEntry[] = [];
  private services = new Map<TranslationProviderId, TranslationServicePublic>();
  private provider: TranslationProviderId = "deepl";
  private sentenceIndex = 0;
  private loaded = false;
  private loading = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly onSelectionChanged: (selection: TranslationServiceSelection) => void = () => undefined,
  ) {
    host.innerHTML = `
      <div class="translation-service-shell">
        <aside class="translation-service-list" aria-label="翻译服务">
          <button type="button" class="translation-service-item" data-provider="deepl">
            <span class="translation-service-dot" aria-hidden="true"></span>
            <span>DeepL</span>
            <small data-service-state="deepl">未配置</small>
          </button>
          <button type="button" class="translation-service-item" data-provider="chatgpt">
            <span class="translation-service-dot" aria-hidden="true"></span>
            <span>ChatGPT</span>
            <small data-service-state="chatgpt">未配置</small>
          </button>
        </aside>
        <section class="translation-service-main">
          <header class="translation-service-header">
            <div>
              <strong id="translation-service-name">DeepL</strong>
              <span id="translation-service-connection" class="translation-service-state">未配置</span>
            </div>
            <button id="translation-service-save" type="button">保存配置</button>
          </header>

          <div class="translation-service-form">
            <label>API Key
              <span class="translation-service-key-row">
                <input id="translation-service-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="未配置">
                <button id="translation-service-key-toggle" type="button">显示</button>
                <button id="translation-service-key-clear" type="button">清除</button>
              </span>
            </label>
            <label>Endpoint
              <input id="translation-service-endpoint" type="url" spellcheck="false">
            </label>
            <label id="translation-service-source-row">源语言
              <input id="translation-service-source" type="text" spellcheck="false" placeholder="EN">
            </label>
            <label>目标语言
              <input id="translation-service-target" type="text" spellcheck="false">
            </label>
            <label>模型 / 方案
              <input id="translation-service-model" type="text" spellcheck="false">
            </label>
            <label id="translation-service-instruction-row" hidden>翻译指令
              <textarea id="translation-service-instruction" rows="3" spellcheck="false"></textarea>
            </label>
          </div>
          <div id="translation-service-config-status" class="translation-service-message" role="status"></div>

          <div class="translation-service-divider"><span>例句测试</span></div>
          <div class="translation-service-sentence-nav">
            <button id="translation-service-prev" type="button">上一句</button>
            <button id="translation-service-random" type="button">随机一句</button>
            <button id="translation-service-next" type="button">下一句</button>
            <span id="translation-service-position">—</span>
          </div>
          <div class="translation-service-sample-grid">
            <div>
              <span class="translation-service-caption">原文</span>
              <pre id="translation-service-original">—</pre>
            </div>
            <div>
              <span class="translation-service-caption">实际发送</span>
              <pre id="translation-service-sent">—</pre>
            </div>
          </div>
          <div class="translation-service-test-actions">
            <button id="translation-service-test" type="button">测试翻译</button>
            <span id="translation-service-test-status" class="translation-service-message"></span>
          </div>
          <div class="translation-service-test-result">
            <span class="translation-service-caption">返回</span>
            <pre id="translation-service-result">—</pre>
            <div class="translation-service-result-meta">
              <span id="translation-service-placeholder">占位符检查：—</span>
              <span id="translation-service-latency">延迟：—</span>
            </div>
          </div>
        </section>
      </div>`;

    for (const button of Array.from(this.host.querySelectorAll<HTMLButtonElement>("[data-provider]"))) {
      button.addEventListener("click", () => {
        const provider = button.dataset.provider as TranslationProviderId | undefined;
        if (!provider) return;
        void this.selectProvider(provider);
      });
    }
    this.button("translation-service-key-toggle").addEventListener("click", () => this.toggleKeyVisibility());
    this.button("translation-service-key-clear").addEventListener("click", () => void this.clearKey());
    this.button("translation-service-save").addEventListener("click", () => void this.save());
    this.button("translation-service-prev").addEventListener("click", () => this.moveSentence(-1));
    this.button("translation-service-next").addEventListener("click", () => this.moveSentence(1));
    this.button("translation-service-random").addEventListener("click", () => this.randomSentence());
    this.button("translation-service-test").addEventListener("click", () => void this.testTranslation());
  }

  setContext(chapter: ChapterWorkspaceData | undefined, visible: boolean): void {
    const chapterChanged = chapter?.id !== this.chapter?.id
      || chapter?.sentenceSource?.sourceHash !== this.chapter?.sentenceSource?.sourceHash;
    this.chapter = chapter;
    this.host.hidden = !visible;
    if (chapterChanged) {
      this.sentences = chapter?.sentenceSource?.entries ?? [];
      this.sentenceIndex = Math.min(this.sentenceIndex, Math.max(0, this.sentences.length - 1));
      this.renderSentence();
    }
    if (chapter && !this.loaded && !this.loading) void this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.setConfigStatus("正在读取服务配置…");
    try {
      const response = await fetch("/__workspace/translation-services", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "读取翻译服务失败"));
      const payload = await response.json() as TranslationServicesPayload;
      this.services.clear();
      for (const service of payload.services) this.services.set(service.id, service);
      if (payload.activeProvider === "deepl" || payload.activeProvider === "chatgpt") {
        this.provider = payload.activeProvider;
      }
      this.loaded = true;
      this.setConfigStatus("");
      this.renderService();
      this.renderProviderStates();
    } catch (error) {
      this.setConfigStatus(errorMessage(error));
    } finally {
      this.loading = false;
    }
  }

  private renderService(): void {
    const service = this.services.get(this.provider);
    for (const button of Array.from(this.host.querySelectorAll<HTMLButtonElement>("[data-provider]"))) {
      button.classList.toggle("is-active", button.dataset.provider === this.provider);
    }
    this.text("translation-service-name").textContent = service?.label ?? (this.provider === "deepl" ? "DeepL" : "ChatGPT");
    this.input("translation-service-api-key").value = "";
    this.input("translation-service-api-key").placeholder = service?.apiKeyConfigured
      ? "已配置 · 留空不会修改"
      : "未配置";
    this.input("translation-service-endpoint").value = service?.endpoint ?? "";
    this.input("translation-service-source").value = service?.sourceLanguage ?? "";
    this.input("translation-service-target").value = service?.targetLanguage ?? "";
    this.input("translation-service-model").value = service?.model ?? "";
    this.textarea("translation-service-instruction").value = service?.instruction ?? "";
    this.text("translation-service-source-row").hidden = this.provider !== "deepl";
    this.text("translation-service-instruction-row").hidden = this.provider !== "chatgpt";
    const state = service?.apiKeyConfigured ? "已配置 · 未测试" : "未配置 API Key";
    this.text("translation-service-connection").textContent = state;
    this.renderProviderStates();
    this.emitSelection();
    this.clearTestResult();
  }

  private emitSelection(): void {
    const service = this.services.get(this.provider);
    this.onSelectionChanged({
      id: this.provider,
      label: service?.label ?? (this.provider === "deepl" ? "DeepL" : "ChatGPT"),
      apiKeyConfigured: Boolean(service?.apiKeyConfigured),
    });
  }

  private async selectProvider(provider: TranslationProviderId): Promise<void> {
    this.provider = provider;
    this.renderService();
    try {
      const response = await fetch("/__workspace/translation-services/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ provider }),
      });
      if (!response.ok) throw new Error(await responseError(response, "选择翻译服务失败"));
      const payload = await response.json() as TranslationServicesPayload;
      this.services.clear();
      for (const service of payload.services) this.services.set(service.id, service);
      if (payload.activeProvider === "deepl" || payload.activeProvider === "chatgpt") {
        this.provider = payload.activeProvider;
      }
      this.renderService();
    } catch (error) {
      this.setConfigStatus(errorMessage(error));
    }
  }

  private renderProviderStates(): void {
    for (const provider of ["deepl", "chatgpt"] as const) {
      const service = this.services.get(provider);
      const state = this.host.querySelector<HTMLElement>(`[data-service-state="${provider}"]`);
      const button = this.host.querySelector<HTMLElement>(`[data-provider="${provider}"]`);
      const configured = Boolean(service?.apiKeyConfigured);
      if (state) state.textContent = configured ? "已配置" : "未配置";
      button?.classList.toggle("is-configured", configured);
    }
  }

  private async save(): Promise<void> {
    const config: Record<string, unknown> = {
      endpoint: this.input("translation-service-endpoint").value.trim(),
      targetLanguage: this.input("translation-service-target").value.trim(),
      model: this.input("translation-service-model").value.trim(),
    };
    if (this.provider === "deepl") {
      config.sourceLanguage = this.input("translation-service-source").value.trim();
    } else {
      config.instruction = this.textarea("translation-service-instruction").value.trim();
    }
    const apiKey = this.input("translation-service-api-key").value.trim();
    if (apiKey) config.apiKey = apiKey;
    this.setConfigStatus("正在保存…");
    this.button("translation-service-save").disabled = true;
    try {
      const response = await fetch("/__workspace/translation-services/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ provider: this.provider, config }),
      });
      if (!response.ok) throw new Error(await responseError(response, "保存翻译服务失败"));
      const payload = await response.json() as TranslationServicesPayload;
      this.services.clear();
      for (const service of payload.services) this.services.set(service.id, service);
      this.setConfigStatus("已保存 · API Key 仅存于 Mac 私密配置目录");
      this.renderService();
    } catch (error) {
      this.setConfigStatus(errorMessage(error));
    } finally {
      this.button("translation-service-save").disabled = false;
    }
  }

  private async clearKey(): Promise<void> {
    if (!window.confirm(`清除 ${this.provider === "deepl" ? "DeepL" : "ChatGPT"} API Key？`)) return;
    this.setConfigStatus("正在清除 API Key…");
    try {
      const response = await fetch("/__workspace/translation-services/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ provider: this.provider, config: { clearApiKey: true } }),
      });
      if (!response.ok) throw new Error(await responseError(response, "清除 API Key 失败"));
      const payload = await response.json() as TranslationServicesPayload;
      this.services.clear();
      for (const service of payload.services) this.services.set(service.id, service);
      this.setConfigStatus("API Key 已清除");
      this.renderService();
    } catch (error) {
      this.setConfigStatus(errorMessage(error));
    }
  }

  private async testTranslation(): Promise<void> {
    const sentence = this.sentences[this.sentenceIndex];
    const chapterId = this.chapter?.translationSourceChapterId;
    if (!sentence || !chapterId) {
      this.setTestStatus("没有可用于测试的句子");
      return;
    }
    this.button("translation-service-test").disabled = true;
    this.setTestStatus("正在测试…");
    this.clearTestResult(false);
    try {
      const response = await fetch("/__workspace/translation-services/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          provider: this.provider,
          chapterId,
          sentenceId: sentence.id,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, "测试翻译失败"));
      const result = await response.json() as TranslationTestResult;
      this.text("translation-service-result").textContent = result.translatedText;
      this.text("translation-service-placeholder").textContent = result.placeholderIntegrity
        ? "占位符检查：✓ 完整"
        : `占位符检查：✗ 缺失 ${result.missingPlaceholders.length} / 异常 ${result.unexpectedPlaceholders.length}`;
      this.text("translation-service-latency").textContent = `延迟：${result.durationMs} ms`;
      this.setTestStatus("测试成功 · 未写入正式译文 JSON");
      this.text("translation-service-connection").textContent = "● 已连接";
    } catch (error) {
      const message = errorMessage(error);
      this.setTestStatus(`失败 · ${message}`, true);
      this.text("translation-service-result").textContent = message;
      this.text("translation-service-placeholder").textContent = "占位符检查：未执行";
      this.text("translation-service-latency").textContent = "延迟：—";
      this.text("translation-service-connection").textContent = "● 测试失败";
    } finally {
      this.button("translation-service-test").disabled = false;
    }
  }

  private renderSentence(): void {
    const sentence = this.sentences[this.sentenceIndex];
    this.text("translation-service-position").textContent = this.sentences.length
      ? `${this.sentenceIndex + 1} / ${this.sentences.length}`
      : "0 / 0";
    this.text("translation-service-original").textContent = sentence?.sourceText ?? "—";
    this.text("translation-service-sent").textContent = sentence?.translationText ?? "—";
    const disabled = this.sentences.length === 0;
    this.button("translation-service-prev").disabled = disabled;
    this.button("translation-service-next").disabled = disabled;
    this.button("translation-service-random").disabled = disabled;
    this.button("translation-service-test").disabled = disabled;
    this.clearTestResult();
  }

  private moveSentence(delta: number): void {
    if (!this.sentences.length) return;
    this.sentenceIndex = (this.sentenceIndex + delta + this.sentences.length) % this.sentences.length;
    this.renderSentence();
  }

  private randomSentence(): void {
    if (!this.sentences.length) return;
    this.sentenceIndex = Math.floor(Math.random() * this.sentences.length);
    this.renderSentence();
  }

  private toggleKeyVisibility(): void {
    const input = this.input("translation-service-api-key");
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    this.button("translation-service-key-toggle").textContent = showing ? "显示" : "隐藏";
  }

  private clearTestResult(clearStatus = true): void {
    this.text("translation-service-result").textContent = "—";
    this.text("translation-service-placeholder").textContent = "占位符检查：—";
    this.text("translation-service-latency").textContent = "延迟：—";
    if (clearStatus) this.setTestStatus("");
  }

  private setConfigStatus(value: string): void {
    this.text("translation-service-config-status").textContent = value;
  }

  private setTestStatus(value: string, isError = false): void {
    const status = this.text("translation-service-test-status");
    status.textContent = value;
    status.classList.toggle("is-error", isError);
  }

  private text(id: string): HTMLElement {
    const element = this.host.querySelector<HTMLElement>(`#${id}`);
    if (!element) throw new Error(`missing translation service element: ${id}`);
    return element;
  }

  private input(id: string): HTMLInputElement {
    const element = this.host.querySelector<HTMLInputElement>(`#${id}`);
    if (!element) throw new Error(`missing translation service input: ${id}`);
    return element;
  }

  private textarea(id: string): HTMLTextAreaElement {
    const element = this.host.querySelector<HTMLTextAreaElement>(`#${id}`);
    if (!element) throw new Error(`missing translation service textarea: ${id}`);
    return element;
  }

  private button(id: string): HTMLButtonElement {
    const element = this.host.querySelector<HTMLButtonElement>(`#${id}`);
    if (!element) throw new Error(`missing translation service button: ${id}`);
    return element;
  }
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : fallback;
  } catch {
    return fallback;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
