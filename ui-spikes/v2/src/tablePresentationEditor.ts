import { defaultKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import {
  regexHighlightEffect,
  regexHighlightField,
} from "./regexMatchHighlight";
import type { SourceRegexMatch } from "./sourceRegexSearch";
import { obsidianSyntaxHighlight } from "./workingEditor";
import {
  TABLE_PRESENTATION_DEFAULT,
  TABLE_PRESENTATION_DEFAULT_SOURCE,
  parseTablePresentationConfig,
  resolveDefaultTablePresentation,
  tablePresentationEntryKey,
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
    hardReturnColor: "#9aa79d",
  };
  private lastKnownGoodConfig: TablePresentationConfig =
    structuredClone(TABLE_PRESENTATION_DEFAULT);
  private savedSource = TABLE_PRESENTATION_DEFAULT_SOURCE;

  constructor(
    host: HTMLElement,
    private readonly onApply: (
      resolved: ResolvedTablePresentation,
      sourceEditor: SourceEditorPresentation,
      config: TablePresentationConfig,
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
          regexHighlightField,
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
    this.onApply(
      this.lastKnownGood,
      this.lastKnownGoodSourceEditor,
      this.lastKnownGoodConfig,
    );
  }

  focus(): void {
    this.view.requestMeasure();
    this.view.focus();
  }

  source(): string {
    return this.view.state.doc.toString();
  }

  setRegexMatches(
    matches: readonly SourceRegexMatch[],
    currentIndex: number,
  ): void {
    this.view.dispatch({
      effects: regexHighlightEffect(matches, currentIndex),
    });
  }

  revealOffsets(from: number, to: number, focus = true): void {
    const safeFrom = Math.max(0, Math.min(from, this.view.state.doc.length));
    const safeTo = Math.max(safeFrom, Math.min(to, this.view.state.doc.length));
    this.view.dispatch({
      selection: { anchor: safeFrom, head: safeTo },
      effects: EditorView.scrollIntoView(safeFrom, { y: "center" }),
    });
    if (focus) this.view.focus();
  }

  setSource(source: string): void {
    this.replaceDocument(source);
  }

  currentConfig(): TablePresentationConfig {
    return structuredClone(this.lastKnownGoodConfig);
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
      const persistedSource =
        typeof payload.source === "string"
          ? payload.source
          : TABLE_PRESENTATION_DEFAULT_SOURCE;
      const parsed = parseTablePresentationConfig(persistedSource);
      if (
        parsed.ok
        && parsed.resolved
        && parsed.sourceEditor
        && parsed.config
      ) {
        const displaySource = JSON.stringify(parsed.config, null, 2) + "\n";
        this.replaceDocument(displaySource);
        this.savedSource = displaySource;
        this.applyParsed(
          parsed.resolved,
          parsed.sourceEditor,
          parsed.config,
        );
        this.onStatus(
          parsed.migratedFromLegacy
            ? "表格配置 · 已兼容读取旧格式，保存后升级为五列配置"
            : payload.exists
              ? "表格配置 · 已加载项目配置"
              : "表格配置 · 使用内置默认（项目尚未保存）",
        );
      } else {
        this.onApply(
          this.lastKnownGood,
          this.lastKnownGoodSourceEditor,
          this.lastKnownGoodConfig,
        );
        this.onStatus(
          "表格配置错误 · 已保留最后有效配置 · "
            + (parsed.errors[0] ?? "未知错误"),
        );
      }
    } catch (error) {
      this.onApply(
        this.lastKnownGood,
        this.lastKnownGoodSourceEditor,
        this.lastKnownGoodConfig,
      );
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
    if (
      !parsed.ok
      || !parsed.resolved
      || !parsed.sourceEditor
      || !parsed.config
    ) {
      this.onStatus(
        "表格配置未保存 · "
          + (parsed.errors[0] ?? "配置无效"),
      );
      return false;
    }

    this.applyParsed(parsed.resolved, parsed.sourceEditor, parsed.config);
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
        const body = await response.json().catch(() => ({})) as {
          error?: string;
        };
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
    this.lastKnownGoodSourceEditor = {
      showHardReturns: true,
      hardReturnColor: "#9aa79d",
    };
    this.lastKnownGoodConfig = structuredClone(TABLE_PRESENTATION_DEFAULT);
    this.onApply(
      this.lastKnownGood,
      this.lastKnownGoodSourceEditor,
      this.lastKnownGoodConfig,
    );
    const saved = await this.save();
    if (saved) this.onStatus("表格配置已恢复默认并保存");
    return saved;
  }

  hasUnsavedChanges(): boolean {
    return this.source() !== this.savedSource;
  }

  updateBooleanSetting(
    setting: TablePresentationSettingDescriptor,
    checked: boolean,
  ): void {
    const parsed = parseTablePresentationConfig(this.source());
    if (!parsed.ok || !parsed.config) {
      this.onStatus(
        "当前 JSON 无效，先修复后才能用配置表修改 · "
          + (parsed.errors[0] ?? "配置无效"),
      );
      return;
    }

    const next = structuredClone(parsed.config);
    let entry = next.配置.find(
      (candidate) =>
        candidate.控件 === setting.control
        && tablePresentationEntryKey(candidate) === setting.key,
    );
    if (!entry) {
      entry = {
        控件: setting.control,
        功能组: setting.functionGroup,
        键值: { [setting.key]: checked },
        中文描述: setting.description,
      };
      next.配置.push(entry);
    } else {
      entry.键值[setting.key] = checked;
    }

    const source = JSON.stringify(next, null, 2) + "\n";
    this.replaceDocument(source);
    window.clearTimeout(this.applyTimer);
    this.preview(source);
  }

  revealSetting(setting: TablePresentationSettingDescriptor): void {
    const parsed = parseTablePresentationConfig(this.source());
    if (!parsed.ok || !parsed.config) {
      this.onStatus(
        "当前 JSON 无效，无法定位配置 · "
          + (parsed.errors[0] ?? "配置无效"),
      );
      return;
    }

    if (parsed.migratedFromLegacy) {
      const canonical = JSON.stringify(parsed.config, null, 2) + "\n";
      this.replaceDocument(canonical);
    }

    const source = this.source();
    const controlToken = JSON.stringify(setting.control);
    const keyToken = JSON.stringify(setting.key);
    const controlIndex = source.indexOf(controlToken);
    let keyIndex = controlIndex >= 0
      ? source.indexOf(keyToken, controlIndex + controlToken.length)
      : -1;

    if (keyIndex < 0) {
      const fallback = parsed.config.配置.findIndex(
        (entry) =>
          entry.控件 === setting.control
          && tablePresentationEntryKey(entry) === setting.key,
      );
      if (fallback >= 0) {
        const canonical = JSON.stringify(parsed.config, null, 2) + "\n";
        this.replaceDocument(canonical);
        const refreshed = this.source();
        const refreshedControl = refreshed.indexOf(controlToken);
        keyIndex = refreshedControl >= 0
          ? refreshed.indexOf(
              keyToken,
              refreshedControl + controlToken.length,
            )
          : -1;
      }
    }

    if (keyIndex < 0) {
      this.onStatus("该配置项未出现在 JSON 中");
      return;
    }

    this.view.dispatch({
      selection: {
        anchor: keyIndex,
        head: keyIndex + keyToken.length,
      },
      effects: EditorView.scrollIntoView(keyIndex, {
        y: "center",
      }),
    });
    this.view.focus();
    this.onStatus(
      "已定位 JSON · "
        + setting.control + " / "
        + setting.functionGroup + " / "
        + setting.key,
    );
  }

  private preview(source: string): void {
    const parsed = parseTablePresentationConfig(source);
    if (
      !parsed.ok
      || !parsed.resolved
      || !parsed.sourceEditor
      || !parsed.config
    ) {
      this.onStatus(
        "表格配置错误 · 已保留最后有效配置 · "
          + (parsed.errors[0] ?? "配置无效"),
      );
      return;
    }
    this.applyParsed(
      parsed.resolved,
      parsed.sourceEditor,
      parsed.config,
    );
    this.onStatus(
      source === this.savedSource
        ? "表格配置 · 已保存"
        : "表格配置 · 实时预览（未保存）",
    );
  }

  private applyParsed(
    resolved: ResolvedTablePresentation,
    sourceEditor: SourceEditorPresentation,
    config: TablePresentationConfig,
  ): void {
    this.lastKnownGood = resolved;
    this.lastKnownGoodSourceEditor = sourceEditor;
    this.lastKnownGoodConfig = structuredClone(config);
    this.onApply(
      resolved,
      sourceEditor,
      this.lastKnownGoodConfig,
    );
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
