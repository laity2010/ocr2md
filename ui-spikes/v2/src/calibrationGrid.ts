import {
  AllCommunityModule,
  type ColDef,
  type ICellRendererParams,
  ModuleRegistry,
  type RowClickedEvent,
  colorSchemeDark,
  createGrid,
  themeQuartz,
} from "ag-grid-community";
import { locateCandidate } from "../../../src/rowIdentity";
import type { AnnotationPair, Candidate, SourceRange } from "../../../src/types";
import type { ActiveReviewModule } from "./workspaceMachine";

ModuleRegistry.registerModules([AllCommunityModule]);

const calibrationTheme = themeQuartz
  .withPart(colorSchemeDark)
  .withParams({
    backgroundColor: "#2f383e",
    foregroundColor: "#d3c6aa",
    chromeBackgroundColor: "#272f34",
    borderColor: "#475258",
    accentColor: "#83c092",
    headerTextColor: "#d3c6aa",
    oddRowBackgroundColor: "#2c353a",
    rowHoverColor: "rgba(131, 192, 146, 0.12)",
    selectedRowBackgroundColor: "rgba(131, 192, 146, 0.18)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "var(--grid-font-size)",
  });

const IGNORED = "已忽略";
const DELETED = "已删除";
const CHAPTER_TITLE_LINE_TYPES = [
  "1 级标题",
  "2 级标题",
  "3 级标题",
  "4 级标题",
  "5 级标题",
  "6 级标题",
  IGNORED,
] as const;

function firstCodePoints(text: string, count: number): string {
  return Array.from(text).slice(0, count).join("");
}

function lastCodePoints(text: string, count: number): string {
  return Array.from(text).slice(-count).join("");
}

export function illegalLineBreakContextPreview(
  row: Candidate | undefined,
): string {
  if (!row) return "";
  const previous = String(row.previousLineText ?? "").trimEnd();
  const next = String(row.nextLineText ?? "").trimStart();
  if (!previous && !next) return String(row.preview ?? "");
  return `${lastCodePoints(previous, 10)} ⏎ ${firstCodePoints(next, 10)}`;
}

export function illegalLineBreakMergedPreview(
  row: Candidate | undefined,
): string {
  if (!row) return "";
  const merged = String(row.mergedPreview ?? row.preview ?? "").trim();
  if (!merged) return "";
  return firstCodePoints(merged, 40);
}

function visibleRowsForModule(
  rows: Candidate[],
  module: ActiveReviewModule,
): Candidate[] {
  return rows.filter((row) => {
    if (row.typeLabel !== module) return false;
    if (row.lineType === IGNORED || row.lineType === DELETED) return false;
    if (module === "章节标题") {
      return /^[1-6]\s*级标题$/.test(row.lineType ?? "");
    }
    return true;
  });
}

export class CalibrationGrid {
  private editable = false;
  private rows: Candidate[] = [];
  private annotationPairs: AnnotationPair[] = [];
  private workingText = "";
  private module: ActiveReviewModule = "章节标题";
  private headingNumberingEnabled = true;

  private readonly api;

  constructor(
    host: HTMLElement,
    private readonly onLineTypeChanged: (rowId: string, lineType: string) => void,
    private readonly onAnnotationNumberChanged: (
      rowId: string,
      value: string,
    ) => void,
    private readonly onChapterFileChanged: (
      rowId: string,
      value: string,
    ) => void,
    private readonly onRowActivated: (
      row: Candidate,
      located: SourceRange | undefined,
      activation?: "row" | "illegal-context" | "changed-deleted",
    ) => void,
  ) {
    this.api = createGrid<Candidate>(host, {
      theme: calibrationTheme,
      rowData: [],
      columnDefs: this.columnDefs(),
      defaultColDef: {
        sortable: true,
        resizable: true,
        suppressMovable: true,
      },
      suppressMovableColumns: true,
      rowHeight: 42,
      headerHeight: 38,
      animateRows: false,
      getRowId: (params) => params.data.rowId ?? params.data.id,
      rowClassRules: {
        "row-deleted-change": (params) =>
          this.module === "变动行"
          && params.data?.chapterBoundaryState === "deleted",
      },
      onRowClicked: (event: RowClickedEvent<Candidate>) => {
        if (!event.data) return;
        this.activateRow(event.data);
      },
    });
  }

  setContext(
    rows: Candidate[],
    workingText: string,
    module: ActiveReviewModule,
    headingNumberingEnabled = true,
    annotationPairs: AnnotationPair[] = [],
  ): void {
    const moduleChanged = this.module !== module;
    const numberingChanged =
      this.headingNumberingEnabled !== headingNumberingEnabled;
    this.rows = rows;
    this.annotationPairs = annotationPairs;
    this.workingText = workingText;
    this.module = module;
    this.headingNumberingEnabled = headingNumberingEnabled;

    if (moduleChanged) {
      const columnDefs = this.columnDefs();
      this.api.setGridOption("columnDefs", columnDefs);
      this.api.applyColumnState({
        state: this.columnOrder().map((colId) => ({ colId })),
        applyOrder: true,
      });
    }

    this.api.setGridOption("rowData", visibleRowsForModule(rows, module));
    this.api.refreshCells({ force: true });

    if (moduleChanged) {
      this.api.refreshHeader();
      this.api.redrawRows();
    } else if (numberingChanged && module === "章节标题") {
      this.api.refreshCells({ force: true });
    }
  }

  ignoreFirstVisible(): string | undefined {
    if (!this.editable) return undefined;
    const target = visibleRowsForModule(this.rows, this.module)[0];
    if (!target) return undefined;
    this.onLineTypeChanged(target.id, IGNORED);
    return target.id;
  }

  demoteFirstVisibleHeading(): string | undefined {
    if (!this.editable || this.module !== "章节标题") return undefined;
    const target = visibleRowsForModule(this.rows, this.module)[0];
    if (!target) return undefined;
    const match = /^([1-6])\s*级标题$/.exec(String(target.lineType ?? ""));
    if (!match) return undefined;
    const level = Number(match[1]);
    if (level >= 6) return undefined;
    this.onLineTypeChanged(target.id, `${level + 1} 级标题`);
    return target.id;
  }

  renumberFirstVisibleAnnotation(value = "99"): string | undefined {
    if (!this.editable || this.module !== "注释") return undefined;
    const target = visibleRowsForModule(this.rows, this.module)[0];
    if (!target) return undefined;
    this.onAnnotationNumberChanged(target.id, value);
    return target.id;
  }

  focusFirstVisible(): string | undefined {
    const target = visibleRowsForModule(this.rows, this.module)[0];
    if (!target) return undefined;
    this.activateRow(target);
    return target.id;
  }

  setEditable(editable: boolean): void {
    if (this.editable === editable) return;
    this.editable = editable;
    this.api.refreshCells({ force: true });
  }

  private activateRow(row: Candidate): void {
    if (this.module === "变动行") {
      if (row.chapterBoundaryState === "deleted") {
        this.onRowActivated(row, undefined, "changed-deleted");
        return;
      }
      this.onRowActivated(row, row.range, "row");
      return;
    }

    this.onRowActivated(
      row,
      locateCandidate(this.workingText, row),
      row.typeLabel === "非法断行" ? "illegal-context" : "row",
    );
  }

  private locatedLine(row: Candidate | undefined): number | null {
    if (!row) return null;
    if (this.module === "变动行") return row.range.line + 1;
    const located = locateCandidate(this.workingText, row);
    return located ? located.line + 1 : null;
  }

  private columnDefs(): ColDef<Candidate>[] {
    const columns: ColDef<Candidate>[] = [
      {
        colId: "sourceLine",
        headerName: this.module === "非法断行" ? "断行处" : "行号",
        width: 82,
        minWidth: 72,
        pinned: this.module === "嵌入块" ? undefined : "left",
        valueGetter: (params) => this.locatedLine(params.data),
        sort: "asc",
        sortIndex: 0,
      },
      {
        field: "lineType",
        colId: "lineType",
        headerName: this.module === "变动行" ? "变动" : "行类型",
        width: this.module === "变动行" ? 100 : 150,
        minWidth: this.module === "变动行" ? 90 : 130,
        cellRenderer: (params: ICellRendererParams<Candidate, string>) =>
          this.lineTypeRenderer(params),
      },
    ];

    if (this.module === "注释") {
      columns.push({
        field: "annotationNumber",
        colId: "annotationNumber",
        headerName: "注释号",
        width: 92,
        minWidth: 82,
        cellRenderer: (params: ICellRendererParams<Candidate, string>) =>
          this.annotationNumberRenderer(params),
      });
      columns.push({
        colId: "annotationPairStatus",
        headerName: "配对状态",
        width: 112,
        minWidth: 100,
        valueGetter: (params) => this.annotationPairStatus(params.data),
      });
    }
    if (this.module === "嵌入块") {
      columns.push({
        field: "embedNumber",
        colId: "embedNumber",
        headerName: "组号",
        width: 78,
        minWidth: 68,
        pinned: "left",
      });
    }
    if (this.module === "章节定界") {
      columns.push({
        field: "chapterFile",
        colId: "chapterFile",
        headerName: "章节文件",
        width: 240,
        minWidth: 200,
        cellRenderer: (params: ICellRendererParams<Candidate, string>) =>
          this.chapterFileRenderer(params),
      });
    }
    if (this.module === "变动行") {
      columns.push(
        {
          colId: "changeOwner",
          headerName: "归属模块",
          width: 120,
          minWidth: 110,
          valueGetter: (params) =>
            (params.data as (Candidate & { changeOwner?: string }) | undefined)
              ?.changeOwner ?? "未归类",
        },
        {
          field: "preview",
          colId: "changedContent",
          headerName: "变动内容",
          minWidth: 360,
          flex: 1,
        },
        {
          field: "baselinePreview",
          colId: "baselineContent",
          headerName: "原稿内容",
          minWidth: 300,
          flex: 1,
        },
      );
    }
    if (this.module === "翻译") {
      columns.push(
        {
          field: "preview",
          colId: "translationSource",
          headerName: "原文",
          minWidth: 320,
          flex: 1,
        },
        {
          colId: "translationDeepL",
          headerName: "DeepL",
          minWidth: 300,
          flex: 1,
          valueGetter: (params) =>
            this.translationResultText(params.data, "deepl"),
        },
        {
          colId: "translationOpenAI",
          headerName: "GPT",
          minWidth: 300,
          flex: 1,
          valueGetter: (params) =>
            this.translationResultText(params.data, "openai"),
        },
      );
    }

    if (this.module === "变动行") {
      // Changed-line audit columns are already complete above.
    } else if (this.module === "翻译") {
      // Translation source/provider columns are already complete above.
    } else if (this.module === "章节标题") {
      columns.push({
        colId: "chapterHeadingPreview",
        headerName: "标题预览",
        minWidth: 360,
        flex: 1,
        cellRenderer: (params: ICellRendererParams<Candidate, string>) =>
          this.chapterHeadingPreviewRenderer(params),
      });
    } else if (this.module === "非法断行") {
      columns.push(
        {
          colId: "illegalBreakContext",
          headerName: "预览（前10 + 后10）",
          minWidth: 300,
          flex: 1,
          valueGetter: (params) => illegalLineBreakContextPreview(params.data),
          cellRenderer: (params: ICellRendererParams<Candidate, string>) =>
            this.illegalContextRenderer(params),
        },
        {
          colId: "illegalBreakMerged",
          headerName: "合并预览",
          minWidth: 320,
          flex: 1,
          valueGetter: (params) => illegalLineBreakMergedPreview(params.data),
        },
        {
          field: "breakReason",
          colId: "breakReason",
          headerName: "判断",
          minWidth: 220,
          flex: 1,
        },
      );
    } else {
      columns.push({
        field: "preview",
        colId: "preview",
        headerName: "预览",
        minWidth: 360,
        flex: 1,
      });
    }
    return columns;
  }

  private columnOrder(): string[] {
    if (this.module === "注释") {
      return [
        "sourceLine",
        "lineType",
        "annotationNumber",
        "annotationPairStatus",
        "preview",
      ];
    }
    if (this.module === "嵌入块") {
      return ["embedNumber", "sourceLine", "lineType", "preview"];
    }
    if (this.module === "章节定界") {
      return ["sourceLine", "lineType", "chapterFile", "preview"];
    }
    if (this.module === "变动行") {
      return [
        "sourceLine",
        "lineType",
        "changeOwner",
        "changedContent",
        "baselineContent",
      ];
    }
    if (this.module === "翻译") {
      return [
        "sourceLine",
        "lineType",
        "translationSource",
        "translationDeepL",
        "translationOpenAI",
      ];
    }
    if (this.module === "非法断行") {
      return [
        "sourceLine",
        "lineType",
        "illegalBreakContext",
        "illegalBreakMerged",
        "breakReason",
      ];
    }
    if (this.module === "章节标题") {
      return ["sourceLine", "lineType", "chapterHeadingPreview"];
    }
    return ["sourceLine", "lineType", "preview"];
  }

  private translationResultText(
    row: Candidate | undefined,
    serviceId: "deepl" | "openai",
  ): string {
    if (!row) return "";
    const result = row.translationResults?.[serviceId];
    if (result?.status === "已翻译" && result.translatedText) {
      return result.translatedText;
    }
    if (result?.status === "失败") {
      return result.error ? `失败：${result.error}` : "失败";
    }
    return "待翻译";
  }

  private chapterHeadingOrdinal(row: Candidate): number | undefined {
    const headings = this.rows
      .filter(
        (candidate) =>
          candidate.typeLabel === "章节标题"
          && candidate.lineType !== IGNORED
          && candidate.lineType !== DELETED
          && /^[1-6]\s*级标题$/.test(candidate.lineType ?? ""),
      )
      .map((candidate) => ({
        row: candidate,
        located: locateCandidate(this.workingText, candidate),
      }))
      .sort((left, right) =>
        (left.located?.line ?? left.row.range.line)
        - (right.located?.line ?? right.row.range.line)
        || (left.located?.start ?? left.row.range.start)
        - (right.located?.start ?? right.row.range.start));

    const index = headings.findIndex((item) => item.row.id === row.id);
    return index >= 0 ? index + 1 : undefined;
  }

  private chapterHeadingPreviewRenderer(
    params: ICellRendererParams<Candidate, string>,
  ): HTMLElement {
    const row = params.data;
    const match = /^([1-6])\s*级标题$/.exec(String(row?.lineType ?? ""));
    if (!row || !match) {
      const node = document.createElement("div");
      node.textContent = String(row?.preview ?? row?.raw ?? "");
      return node;
    }

    const level = Number(match[1]);
    const source = String(row.raw ?? row.preview ?? "");
    const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
    const content = firstLine
      .replace(/^ {0,3}#{1,6}(?:\s+|$)/, "")
      .trim();
    const ordinal = this.chapterHeadingOrdinal(row);
    const prefix =
      this.headingNumberingEnabled && ordinal != null
        ? `(${String(ordinal).padStart(3, "0")}) `
        : "";

    const node = document.createElement(`h${level}`);
    node.className = "chapter-heading-preview";
    node.textContent = prefix + content;
    return node;
  }

  private illegalContextRenderer(
    params: ICellRendererParams<Candidate, string>,
  ): HTMLElement {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "illegal-line-break-preview";
    node.textContent = String(params.value ?? "");
    node.title = "点击定位并选中断点前后各 10 个字符";
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!params.data) return;
      this.onRowActivated(
        params.data,
        locateCandidate(this.workingText, params.data),
        "illegal-context",
      );
    });
    return node;
  }

  private lineTypeRenderer(
    params: ICellRendererParams<Candidate, string>,
  ): HTMLElement {
    if (this.module === "变动行") {
      const node = document.createElement("span");
      node.className = "changed-line-state";
      node.textContent = String(params.value ?? "");
      return node;
    }

    const select = document.createElement("select");
    select.className = "calibration-line-type";
    select.setAttribute("aria-label", "行类型");
    select.disabled = !this.editable;

    const current = String(params.value ?? "");
    const choices = params.data?.typeLabel === "章节标题"
      ? [...CHAPTER_TITLE_LINE_TYPES]
      : current && current !== IGNORED
        ? [current, IGNORED]
        : [IGNORED];

    for (const value of choices) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    select.value = current || IGNORED;

    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("change", () => {
      if (!this.editable || !params.data) return;
      if (select.value === current) return;
      this.onLineTypeChanged(params.data.id, select.value);
    });
    return select;
  }

  private annotationPairStatus(row: Candidate | undefined): string {
    if (!row || row.typeLabel !== "注释") return "";
    if (row.lineType !== "注释引用" && row.lineType !== "注释正文") return "";
    if (!String(row.annotationNumber ?? "").trim()) return "待补注释号";
    const pair = this.annotationPairs.find(
      (candidate) =>
        candidate.refCandidateId === row.id
        || candidate.bodyCandidateId === row.id,
    );
    if (pair) return pair.status;
    return row.lineType === "注释引用" ? "待补正文" : "待补引用";
  }

  private annotationNumberRenderer(
    params: ICellRendererParams<Candidate, string>,
  ): HTMLElement {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "annotation-number-input";
    input.setAttribute("aria-label", "注释号");
    input.spellcheck = false;
    input.value = String(params.value ?? "");
    input.disabled = !this.editable;
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", () => {
      if (!this.editable || !params.data) return;
      const next = input.value.trim();
      const current = String(params.data.annotationNumber ?? "").trim();
      if (next === current) return;
      this.onAnnotationNumberChanged(params.data.id, next);
    });
    return input;
  }

  private chapterFileRenderer(
    params: ICellRendererParams<Candidate, string>,
  ): HTMLElement {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "chapter-file-input";
    input.setAttribute("aria-label", "章节文件");
    input.spellcheck = false;
    input.value = String(params.value ?? "");
    input.disabled =
      !this.editable
      || params.data?.typeLabel !== "章节定界"
      || params.data?.lineType !== "1 级标题";
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", () => {
      if (!this.editable || !params.data || input.disabled) return;
      const next = input.value.trim();
      const current = String(params.data.chapterFile ?? "").trim();
      if (next === current) return;
      this.onChapterFileChanged(params.data.id, next);
    });
    return input;
  }

  destroy(): void {
    this.api.destroy();
  }
}
