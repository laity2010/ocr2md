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
import {
  resolveDefaultTablePresentation,
  type ResolvedTableModulePresentation,
  type TableColumnId,
  type TablePresentationModule,
} from "./tablePresentationConfig";

ModuleRegistry.registerModules([AllCommunityModule]);

export const calibrationTheme = themeQuartz
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
  private presentation = resolveDefaultTablePresentation();
  private presentationRowOrderSignature = "";

  private readonly api;

  constructor(
    host: HTMLElement,
    private readonly onLineTypeChanged: (rowId: string, lineType: string) => void,
    private readonly onChapterFileChanged: (
      rowId: string,
      value: string,
    ) => void,
    private readonly onRowActivated: (
      row: Candidate,
      located: SourceRange | undefined,
      activation?: "row" | "illegal-context" | "changed-deleted" | "media",
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
      this.api.setGridOption("rowHeight", module === "媒体" ? 64 : 42);
      this.rebuildPresentationColumns();
    }

    this.refreshPresentationRows(moduleChanged);

    if (moduleChanged) {
      this.api.refreshHeader();
      this.api.redrawRows();
    } else if (numberingChanged && module === "章节标题") {
      this.api.refreshCells({ force: true });
    }
  }

  setPresentationConfig(
    presentation: Record<
      TablePresentationModule,
      ResolvedTableModulePresentation
    >,
  ): void {
    this.presentation = presentation;
    this.presentationRowOrderSignature = "";
    this.rebuildPresentationColumns();
    this.refreshPresentationRows(true);
    this.api.refreshHeader();
    this.api.redrawRows();
  }

  private rebuildPresentationColumns(): void {
    this.api.setGridOption("columnDefs", this.columnDefs());
    this.api.applyColumnState({
      state: this.presentation[this.module].columns.map((column) => ({
        colId: column.colId,
        pinned: column.pinned ?? null,
        hide: column.hidden ?? false,
        sort: null,
        sortIndex: null,
      })),
      applyOrder: true,
    });
  }

  private refreshPresentationRows(forceRebuild = false): void {
    const visibleRows = visibleRowsForModule(this.rows, this.module);
    const gridRows = this.sortRowsForPresentation(visibleRows);
    const signature = this.presentationRowSignature(gridRows);
    if (forceRebuild || signature !== this.presentationRowOrderSignature) {
      this.api.setGridOption("rowData", []);
    }
    this.api.setGridOption("rowData", gridRows);
    this.presentationRowOrderSignature = signature;
    this.api.refreshCells({ force: true });
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

  focusFirstVisible(): string | undefined {
    const target = visibleRowsForModule(this.rows, this.module)[0];
    if (!target) return undefined;
    this.activateRow(target);
    return target.id;
  }

  revealRow(rowKey: string, focusCell = true): boolean {
    if (!rowKey) return false;
    const gridRows = this.sortRowsForPresentation(
      visibleRowsForModule(this.rows, this.module),
    );
    const index = gridRows.findIndex(
      (row) => (row.rowId ?? row.id) === rowKey,
    );
    if (index < 0) return false;
    this.api.ensureIndexVisible(index, "middle");
    if (focusCell) this.api.setFocusedCell(index, "sourceLine");
    return true;
  }

  revealSourceLine(lineNumber: number): boolean {
    if (!Number.isInteger(lineNumber) || lineNumber < 1) return false;
    const gridRows = this.sortRowsForPresentation(
      visibleRowsForModule(this.rows, this.module),
    );
    const index = gridRows.findIndex(
      (row) => this.locatedLine(row) === lineNumber,
    );
    if (index < 0) return false;
    this.api.ensureIndexVisible(index, "middle");
    return true;
  }

  setEditable(editable: boolean): void {
    if (this.editable === editable) return;
    this.editable = editable;
    this.api.refreshCells({ force: true });
  }

  private activateRow(row: Candidate): void {
    if (this.module === "媒体") {
      this.onRowActivated(row, undefined, "media");
      return;
    }
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
    if (this.module === "媒体") {
      const mediaColumns: ColDef<Candidate>[] = [
        {
          colId: "mediaGroup",
          headerName: "分组",
          valueGetter: (params) => params.data?.mediaGroup ?? "",
        },
        {
          colId: "mediaThumbnail",
          headerName: "缩略图",
          sortable: false,
          cellRenderer: (params: ICellRendererParams<Candidate>) =>
            this.mediaThumbnailRenderer(params),
        },
        {
          colId: "mediaFileName",
          headerName: "文件名",
          valueGetter: (params) => params.data?.raw ?? "",
        },
        {
          colId: "mediaSize",
          headerName: "大小",
          valueGetter: (params) =>
            this.formatMediaSize(params.data?.mediaSizeBytes),
        },
      ];
      const mediaById = new Map(
        mediaColumns.map((column) => [
          String(column.colId ?? column.field ?? ""),
          column,
        ]),
      );
      return this.presentation[this.module].columns.flatMap((presentation) => {
        const base = mediaById.get(presentation.colId);
        if (!base) return [];
        return [{
          ...base,
          width: presentation.width,
          minWidth: presentation.minWidth,
          flex: presentation.flex,
          hide: presentation.hidden ?? false,
          pinned: presentation.pinned ?? undefined,
          sort: undefined,
          sortIndex: undefined,
        }];
      });
    }

    const columns: ColDef<Candidate>[] = [
      {
        colId: "sourceLine",
        headerName: this.module === "非法断行" ? "断行处" : "行号",
        valueGetter: (params) => this.locatedLine(params.data),
      },
      {
        field: "lineType",
        colId: "lineType",
        headerName: this.module === "变动行" ? "变动" : "行类型",
        cellRenderer: (params: ICellRendererParams<Candidate, string>) =>
          this.lineTypeRenderer(params),
      },
    ];

    if (this.module === "注释") {
      columns.push({
        field: "annotationNumber",
        colId: "annotationNumber",
        headerName: "注释号",
        comparator: (left, right) =>
          this.groupNumberSortValue(left) - this.groupNumberSortValue(right),
      });
      columns.push({
        colId: "annotationPairStatus",
        headerName: "配对状态",
        valueGetter: (params) => this.annotationPairStatus(params.data),
      });
    }
    if (this.module === "嵌入块") {
      columns.push({
        field: "embedNumber",
        colId: "embedNumber",
        headerName: "组号",
        comparator: (left, right) =>
          this.groupNumberSortValue(left) - this.groupNumberSortValue(right),
      });
    }
    if (this.module === "章节定界") {
      columns.push({
        field: "chapterFile",
        colId: "chapterFile",
        headerName: "章节文件",
        cellRenderer: (params: ICellRendererParams<Candidate, string>) =>
          this.chapterFileRenderer(params),
      });
    }
    if (this.module === "变动行") {
      columns.push(
        {
          colId: "changeOwner",
          headerName: "归属模块",
          valueGetter: (params) =>
            (params.data as (Candidate & { changeOwner?: string }) | undefined)
              ?.changeOwner ?? "未归类",
        },
        {
          field: "preview",
          colId: "changedContent",
          headerName: "变动内容",
        },
        {
          field: "baselinePreview",
          colId: "baselineContent",
          headerName: "原稿内容",
        },
      );
    }
    if (this.module === "翻译") {
      columns.push(
        {
          field: "preview",
          colId: "translationSource",
          headerName: "原文",
        },
        {
          colId: "translationDeepL",
          headerName: "DeepL",
          valueGetter: (params) =>
            this.translationResultText(params.data, "deepl"),
        },
        {
          colId: "translationOpenAI",
          headerName: "GPT",
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
        cellRenderer: (params: ICellRendererParams<Candidate, string>) =>
          this.chapterHeadingPreviewRenderer(params),
      });
    } else if (this.module === "非法断行") {
      columns.push(
        {
          colId: "illegalBreakContext",
          headerName: "预览（前10 + 后10）",
          valueGetter: (params) => illegalLineBreakContextPreview(params.data),
          cellRenderer: (params: ICellRendererParams<Candidate, string>) =>
            this.illegalContextRenderer(params),
        },
        {
          colId: "illegalBreakMerged",
          headerName: "合并预览",
          valueGetter: (params) => illegalLineBreakMergedPreview(params.data),
        },
        {
          field: "breakReason",
          colId: "breakReason",
          headerName: "判断",
        },
      );
    } else {
      columns.push({
        field: "preview",
        colId: "preview",
        headerName: "预览",
      });
    }
    const baseById = new Map(
      columns.map((column) => [
        String(column.colId ?? column.field ?? ""),
        column,
      ]),
    );
    return this.presentation[this.module].columns.flatMap((presentation) => {
      const base = baseById.get(presentation.colId);
      if (!base) return [];
      return [{
        ...base,
        width: presentation.width,
        minWidth: presentation.minWidth,
        flex: presentation.flex,
        hide: presentation.hidden ?? false,
        pinned: presentation.pinned ?? undefined,
        sort: undefined,
        sortIndex: undefined,
      }];
    });
  }

  private mediaThumbnailRenderer(
    params: ICellRendererParams<Candidate>,
  ): HTMLElement | string {
    const source = params.data?.localPath;
    if (!source) return "";
    const image = document.createElement("img");
    image.src = source;
    image.alt = params.data?.raw ?? "媒体预览";
    image.loading = "lazy";
    image.style.display = "block";
    image.style.width = "52px";
    image.style.height = "52px";
    image.style.objectFit = "contain";
    image.style.borderRadius = "4px";
    return image;
  }

  private formatMediaSize(sizeBytes: number | undefined): string {
    if (sizeBytes === undefined) return "—";
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1024 * 1024) {
      return `${(sizeBytes / 1024).toFixed(1)} KB`;
    }
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private groupNumberSortValue(value: unknown): number {
    const parsed = Number.parseInt(String(value ?? "").trim(), 10);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  }

  private sortRowsForPresentation(rows: Candidate[]): Candidate[] {
    const rules = this.presentation[this.module].sort;
    if (!rules.length) return [...rows];

    return [...rows].sort((left, right) => {
      for (const rule of rules) {
        const compared = this.comparePresentationValues(
          this.presentationSortValue(left, rule.colId),
          this.presentationSortValue(right, rule.colId),
        );
        if (compared !== 0) {
          return rule.direction === "desc" ? -compared : compared;
        }
      }
      return left.id.localeCompare(right.id);
    });
  }

  private presentationRowSignature(rows: Candidate[]): string {
    const rules = this.presentation[this.module].sort;
    return rows.map((row) => [
      row.id,
      ...rules.map((rule) =>
        String(this.presentationSortValue(row, rule.colId) ?? "")),
    ].join(":")).join("|");
  }

  private comparePresentationValues(left: unknown, right: unknown): number {
    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }
    return String(left ?? "").localeCompare(
      String(right ?? ""),
      "zh-Hans-CN",
      { numeric: true, sensitivity: "base" },
    );
  }

  private presentationSortValue(
    row: Candidate,
    colId: TableColumnId,
  ): unknown {
    switch (colId) {
      case "sourceLine":
        return this.locatedLine(row) ?? Number.MAX_SAFE_INTEGER;
      case "annotationNumber":
        return this.groupNumberSortValue(row.annotationNumber);
      case "embedNumber":
        return this.groupNumberSortValue(row.embedNumber);
      case "lineType":
        return row.lineType ?? "";
      case "chapterFile":
        return row.chapterFile ?? "";
      case "annotationPairStatus":
        return this.annotationPairStatus(row);
      case "chapterHeadingPreview":
      case "preview":
      case "changedContent":
      case "translationSource":
        return row.preview ?? row.raw ?? "";
      case "illegalBreakContext":
        return illegalLineBreakContextPreview(row);
      case "illegalBreakMerged":
        return illegalLineBreakMergedPreview(row);
      case "breakReason":
        return row.breakReason ?? "";
      case "mediaGroup":
        return row.mediaGroup === "已采用"
          ? 0
          : row.mediaGroup === "未采用"
            ? 1
            : row.mediaGroup === "未下载"
              ? 2
              : 3;
      case "mediaThumbnail":
        return "";
      case "mediaFileName":
        return row.raw ?? "";
      case "mediaSize":
        return row.mediaSizeBytes ?? 0;
      case "changeOwner":
        return (row as Candidate & { changeOwner?: string }).changeOwner ?? "";
      case "baselineContent":
        return row.baselinePreview ?? "";
      case "translationDeepL":
        return this.translationResultText(row, "deepl");
      case "translationOpenAI":
        return this.translationResultText(row, "openai");
    }
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
