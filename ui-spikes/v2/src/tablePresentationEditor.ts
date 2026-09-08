import { defaultKeymap } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { obsidianSyntaxHighlight } from "./workingEditor";
import {
  TABLE_PRESENTATION_DEFAULT_SOURCE,
  parseTablePresentationConfig,
  resolveDefaultTablePresentation,
  type ResolvedTableModulePresentation,
  type TablePresentationModule,
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
  private savedSource = TABLE_PRESENTATION_DEFAULT_SOURCE;

  constructor(
    host: HTMLElement,
    private readonly onApply: (resolved: ResolvedTablePresentation) => void,
    private readonly onStatus: (text: string) => void,
  ) {
    this.view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: TABLE_PRESENTATION_DEFAULT_SOURCE,
        extensions: [
          lineNumbers(),
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
    this.onApply(this.lastKnownGood);
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
      if (parsed.ok && parsed.resolved) {
        this.lastKnownGood = parsed.resolved;
        this.onApply(parsed.resolved);
        this.onStatus(
          payload.exists
            ? "表格配置 · 已加载项目配置"
            : "表格配置 · 使用内置默认（项目尚未保存）",
        );
      } else {
        this.onApply(this.lastKnownGood);
        this.onStatus(
          "表格配置错误 · 已保留最后有效配置 · "
            + (parsed.errors[0] ?? "未知错误"),
        );
      }
    } catch (error) {
      this.onApply(this.lastKnownGood);
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
    if (!parsed.ok || !parsed.resolved) {
      this.onStatus(
        "表格配置未保存 · "
          + (parsed.errors[0] ?? "配置无效"),
      );
      return false;
    }

    this.lastKnownGood = parsed.resolved;
    this.onApply(parsed.resolved);
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
    this.onApply(this.lastKnownGood);
    const saved = await this.save();
    if (saved) this.onStatus("表格配置已恢复默认并保存");
    return saved;
  }

  hasUnsavedChanges(): boolean {
    return this.source() !== this.savedSource;
  }

  private preview(source: string): void {
    const parsed = parseTablePresentationConfig(source);
    if (!parsed.ok || !parsed.resolved) {
      this.onStatus(
        "表格配置错误 · 已保留最后有效配置 · "
          + (parsed.errors[0] ?? "配置无效"),
      );
      return;
    }
    this.lastKnownGood = parsed.resolved;
    this.onApply(parsed.resolved);
    this.onStatus(
      source === this.savedSource
        ? "表格配置 · 已保存"
        : "表格配置 · 实时预览（未保存）",
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
