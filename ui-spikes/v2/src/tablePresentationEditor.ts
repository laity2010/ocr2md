import { defaultKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { obsidianSyntaxHighlight } from "./workingEditor";
import {
  TABLE_PRESENTATION_DEFAULT,
  TABLE_PRESENTATION_DEFAULT_SOURCE,
  TABLE_PRESENTATION_SETTINGS,
  parseTablePresentationConfig,
  resolveDefaultTablePresentation,
  type ResolvedTableModulePresentation,
  type SourceEditorPresentation,
  type TablePresentationConfig,
  type TablePresentationModule,
  type TablePresentationSettingDescriptor,
} from "./tablePresentationConfig";

export type ResolvedTablePresentation =
  Record<TablePresentationModule, ResolvedTableModulePresentation>;

interface TablePresentationPayload {
  exists?: boolean;
  source?: string | null;
  storagePath?: string;
  savedAt?: string;
}

export class TablePresentationEditor {
  private readonly view: EditorView;
  private applyTimer = 0;
  private lastKnownGood = resolveDefaultTablePresentation();
  private lastKnownGoodSourceEditor: SourceEditorPresentation = {
    showHardReturns: true,
  };
  private savedSource = TABLE_PRESENTATION_DEFAULT_SOURCE;
  private settingsConfig: TablePresentationConfig =
    structuredClone(TABLE_PRESENTATION_DEFAULT);
  private settingsFilter = "";

  constructor(
    host: HTMLElement,
    private readonly searchInput: HTMLInputElement,
    private readonly settingsHost: HTMLElement,
    private readonly onApply: (
      resolved: ResolvedTablePresentation,
      sourceEditor: SourceEditorPresentation,
    ) => void,
    private readonly onStatus: (text: string) => void,
  ) {
    this.view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: TABLE_PRESENTATION_DEFAULT_SOURCE,
        extensions: [
          lineNumbers(),
          json(),
          syntaxHighlighting(obsidianSyntaxHighlight),
          keymap.of(defaultKeymap),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            window.clearTimeout(this.applyTimer);
            this.applyTimer = window.setTimeout(() => {
              this.preview(update.state.doc.toString());
            }, 150);
          }),
        ],
      }),
    });
    this.searchInput.addEventListener("input", () => {
      this.settingsFilter = this.searchInput.value.trim().toLocaleLowerCase();
      this.renderSettings();
    });
    this.renderSettings();
    this.onApply(this.lastKnownGood, { showHardReturns: true });
  }

  focus(): void {
    this.view.requestMeasure();
    this.view.focus();
  }

  source(): string {
    return this.view.state.doc.toString();
  }

  setSource(source: string): void {
    this.replaceDocument(source);
  }

  async load(): Promise<void> {
    try {
      const response = await fetch("/__workspace/table-presentation", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json() as TablePresentationPayload;
      const source =
        typeof payload.source === "string"
          ? payload.source
          : TABLE_PRESENTATION_DEFAULT_SOURCE;
      this.replaceDocument(source);
      this.savedSource = source;
      const parsed = parseTablePresentationConfig(source);
      if (parsed.ok && parsed.resolved && parsed.sourceEditor && parsed.config) {
        this.lastKnownGood = parsed.resolved;
        this.lastKnownGoodSourceEditor = parsed.sourceEditor;
        this.settingsConfig = structuredClone(parsed.config);
        this.renderSettings();
        this.onApply(parsed.resolved, parsed.sourceEditor);
        this.onStatus(
          payload.exists
            ? "表格配置 · 已加载项目配置"
            : "表格配置 · 使用内置默认（项目尚未保存）",
        );
      } else {
        this.onApply(this.lastKnownGood, this.lastKnownGoodSourceEditor);
        this.onStatus(
          "表格配置错误 · 已保留最后有效配置 · "
            + (parsed.errors[0] ?? "未知错误"),
        );
      }
    } catch (error) {
      this.onApply(this.lastKnownGood, this.lastKnownGoodSourceEditor);
      this.onStatus(
        "表格配置读取失败 · 已使用最后有效配置 · "
          + (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  async save(): Promise<boolean> {
    window.clearTimeout(this.applyTimer);
    const source = this.source();
    const parsed = parseTablePresentationConfig(source);
    if (!parsed.ok || !parsed.resolved || !parsed.sourceEditor) {
      this.onStatus(
        "表格配置未保存 · "
          + (parsed.errors[0] ?? "配置无效"),
      );
      return false;
    }

    this.lastKnownGood = parsed.resolved;
    this.lastKnownGoodSourceEditor = parsed.sourceEditor;
    this.settingsConfig = structuredClone(
      parsed.config ?? TABLE_PRESENTATION_DEFAULT,
    );
    this.renderSettings();
    this.onApply(parsed.resolved, parsed.sourceEditor);
    try {
      const response = await fetch("/__workspace/table-presentation", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      this.savedSource = source;
      this.onStatus("表格配置已保存 · 项目级");
      return true;
    } catch (error) {
      this.onStatus(
        "表格配置已应用，但项目保存失败 · "
          + (error instanceof Error ? error.message : String(error)),
      );
      return false;
    }
  }

  async reset(): Promise<boolean> {
    this.replaceDocument(TABLE_PRESENTATION_DEFAULT_SOURCE);
    window.clearTimeout(this.applyTimer);
    this.lastKnownGood = resolveDefaultTablePresentation();
    this.lastKnownGoodSourceEditor = { showHardReturns: true };
    this.settingsConfig = structuredClone(TABLE_PRESENTATION_DEFAULT);
    this.renderSettings();
    this.onApply(this.lastKnownGood, this.lastKnownGoodSourceEditor);
    const saved = await this.save();
    if (saved) this.onStatus("表格配置已恢复默认并保存");
    return saved;
  }

  hasUnsavedChanges(): boolean {
    return this.source() !== this.savedSource;
  }

  private preview(source: string): void {
    const parsed = parseTablePresentationConfig(source);
    if (!parsed.ok || !parsed.resolved || !parsed.sourceEditor) {
      this.onStatus(
        "表格配置错误 · 已保留最后有效配置 · "
          + (parsed.errors[0] ?? "配置无效"),
      );
      return;
    }
    this.lastKnownGood = parsed.resolved;
    this.lastKnownGoodSourceEditor = parsed.sourceEditor;
    this.settingsConfig = structuredClone(
      parsed.config ?? TABLE_PRESENTATION_DEFAULT,
    );
    this.renderSettings();
    this.onApply(parsed.resolved, parsed.sourceEditor);
    this.onStatus(
      source === this.savedSource
        ? "表格配置 · 已保存"
        : "表格配置 · 实时预览（未保存）",
    );
  }

  private renderSettings(): void {
    const terms = this.settingsFilter
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);
    const matches = TABLE_PRESENTATION_SETTINGS.filter((setting) => {
      if (!terms.length) return true;
      const haystack = [
        setting.group,
        setting.title,
        setting.description,
        setting.id,
        ...setting.keywords,
      ].join(" ").toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    });

    this.settingsHost.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "config-setting-empty";
      empty.textContent = "没有匹配的配置";
      this.settingsHost.append(empty);
      return;
    }

    for (const setting of matches) {
      const row = document.createElement("div");
      row.className = "config-setting-row";
      row.dataset.settingId = setting.id;

      const group = document.createElement("div");
      group.className = "config-setting-group";
      group.textContent = setting.group;

      const titleWrap = document.createElement("div");
      const title = document.createElement("div");
      title.className = "config-setting-title";
      title.textContent = setting.title;
      const description = document.createElement("div");
      description.className = "config-setting-description";
      description.textContent = setting.description;
      const path = document.createElement("div");
      path.className = "config-setting-path";
      path.textContent = setting.id;
      titleWrap.append(title, description, path);

      const control = document.createElement("div");
      control.className = "config-setting-control";
      if (setting.kind === "boolean") {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(this.settingValue(setting));
        checkbox.setAttribute("aria-label", setting.title);
        const state = document.createElement("span");
        state.textContent = checkbox.checked ? "开" : "关";
        checkbox.addEventListener("change", () => {
          state.textContent = checkbox.checked ? "开" : "关";
          this.updateBooleanSetting(setting, checkbox.checked);
        });
        control.append(checkbox, state);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "定位 JSON";
        button.addEventListener("click", () => this.revealSetting(setting));
        control.append(button);
      }

      row.append(group, titleWrap, control);
      if (setting.kind === "json") {
        const summary = document.createElement("div");
        summary.className = "config-setting-summary";
        summary.textContent = this.settingSummary(setting);
        row.append(summary);
      }
      this.settingsHost.append(row);
    }
  }

  private settingValue(setting: TablePresentationSettingDescriptor): unknown {
    let value: unknown = this.settingsConfig;
    for (const segment of setting.path) {
      if (typeof value !== "object" || value === null) return undefined;
      value = (value as Record<string, unknown>)[segment];
    }
    if (
      value === undefined
      && setting.id === "sourceEditor.showHardReturns"
    ) {
      return this.lastKnownGoodSourceEditor.showHardReturns;
    }
    return value;
  }

  private settingSummary(setting: TablePresentationSettingDescriptor): string {
    const value = this.settingValue(setting);
    if (value === undefined) return "使用默认";
    if (Array.isArray(value)) {
      return value.map((entry) => {
        if (typeof entry === "string") return entry;
        if (
          typeof entry === "object"
          && entry !== null
          && "column" in entry
        ) {
          const object = entry as { column?: unknown; direction?: unknown };
          return String(object.column ?? "")
            + (object.direction ? " " + String(object.direction) : "");
        }
        return JSON.stringify(entry);
      }).join(" → ");
    }
    if (typeof value === "object" && value !== null) {
      return Object.keys(value).length + " 项";
    }
    return String(value);
  }

  private updateBooleanSetting(
    setting: TablePresentationSettingDescriptor,
    checked: boolean,
  ): void {
    const parsed = parseTablePresentationConfig(this.source());
    if (!parsed.ok || !parsed.config) {
      this.onStatus(
        "当前 JSON 无效，先修复后才能用设置控件 · "
          + (parsed.errors[0] ?? "配置无效"),
      );
      this.renderSettings();
      return;
    }

    const next = structuredClone(parsed.config) as unknown as Record<string, unknown>;
    let target = next;
    for (const segment of setting.path.slice(0, -1)) {
      const existing = target[segment];
      if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
        target[segment] = {};
      }
      target = target[segment] as Record<string, unknown>;
    }
    target[setting.path.at(-1) ?? ""] = checked;

    const source = JSON.stringify(next, null, 2) + "\n";
    this.replaceDocument(source);
    window.clearTimeout(this.applyTimer);
    this.preview(source);
  }

  private revealSetting(setting: TablePresentationSettingDescriptor): void {
    const source = this.source();
    let searchFrom = 0;
    let targetFrom = -1;
    let targetTo = -1;

    for (const segment of setting.path) {
      const token = JSON.stringify(segment);
      const index = source.indexOf(token, searchFrom);
      if (index < 0) break;
      targetFrom = index;
      targetTo = index + token.length;
      searchFrom = targetTo;
    }

    if (targetFrom < 0) {
      this.onStatus("该项当前使用默认值，JSON 中尚无显式字段");
      return;
    }

    this.view.dispatch({
      selection: { anchor: targetFrom, head: targetTo },
      effects: EditorView.scrollIntoView(targetFrom, {
        y: "center",
      }),
    });
    this.view.focus();
    this.onStatus("已定位 JSON · " + setting.id);
  }

  private replaceDocument(source: string): void {
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: source,
      },
    });
  }
}
