import {
  AllCommunityModule,
  ModuleRegistry,
  createGrid,
  type ColDef,
  type GridApi,
  type ICellRendererParams,
} from "ag-grid-community";
import { calibrationTheme } from "./calibrationGrid";
import type { MineruAuditChange, MineruAuditPayload, MineruAuditRow } from "../../../src/mineruAuditReviewStore";
import type { MineruMarkdownLocator } from "../../../src/mineruAnnotationContract";

ModuleRegistry.registerModules([AllCommunityModule]);

type AuditCallbacks = {
  onInspectPdf: (item: MineruAuditRow, payload: MineruAuditPayload) => void;
  onLocate: (target: MineruMarkdownLocator, item: MineruAuditRow) => void;
  onCountChange: (payload: MineruAuditPayload) => void;
  onVisibleChange: (visible: boolean) => void;
};

/** In-place AG Grid audit inside the regular data-table slot, never a modal. */
export class MineruAuditPanel {
  private payload?: MineruAuditPayload;
  private chapterId = "";
  private loadToken = 0;
  private busy = false;
  private visible = false;
  private selectedId?: string;
  private readonly host = requireElement<HTMLElement>("mineru-audit-workspace");
  private readonly gridHost = requireElement<HTMLElement>("mineru-audit-items");
  private readonly summary = requireElement<HTMLElement>("mineru-audit-summary");
  private readonly evidence = requireElement<HTMLElement>("mineru-audit-evidence");
  private readonly editor = requireElement<HTMLElement>("mineru-audit-review-editor");
  private readonly kindSelect = requireElement<HTMLSelectElement>("mineru-audit-kind");
  private readonly stateSelect = requireElement<HTMLSelectElement>("mineru-audit-state");
  private readonly search = requireElement<HTMLInputElement>("mineru-audit-search");
  private readonly decision = requireElement<HTMLSelectElement>("mineru-audit-decision");
  private readonly note = requireElement<HTMLTextAreaElement>("mineru-audit-note");
  private readonly status = requireElement<HTMLElement>("mineru-audit-status");
  private readonly saveButton = requireElement<HTMLButtonElement>("mineru-audit-save");
  private readonly locateButton = requireElement<HTMLButtonElement>("mineru-audit-locate-md");
  private readonly targetSelect = requireElement<HTMLSelectElement>("mineru-audit-target-select");
  private readonly api: GridApi<MineruAuditRow>;

  constructor(private readonly callbacks: AuditCallbacks) {
    const columns: ColDef<MineruAuditRow>[] = [
      {
        colId: "pdfPageNumber", headerName: "原 PDF 页",
        width: 112, minWidth: 96,
        valueGetter: ({ data }) => data?.pdfPageNumber ?? "",
        comparator: (a, b) => Number(a || 0) - Number(b || 0),
      },
      {
        colId: "documentKey", headerName: "来源段", width: 100,
        valueGetter: ({ data }) => data?.documentKey.split("/").pop()?.slice(0, 2) ?? "",
        tooltipValueGetter: ({ data }) => data?.documentKey ?? "",
      },
      {
        field: "pageNumber", headerName: "段内页", width: 100,
      },
      {
        field: "annotationNumber", headerName: "注释号", width: 95,
      },
      {
        field: "kind", headerName: "异常类型",
        minWidth: 145, flex: 1,
        filter: "agTextColumnFilter",
      },
      {
        field: "detail", headerName: "OCR 原文 / 证据",
        minWidth: 225, flex: 2,
        tooltipValueGetter: ({ data }) => data?.detail ?? "",
        cellRenderer: ({ data }: ICellRendererParams<MineruAuditRow>) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "mineru-note-preview";
          button.textContent = data?.detail ?? "";
          button.title = "点击查看原 PDF 附件对应页（上方 MD 可修正）";
          // Row click handles inspect; no duplicate listener here.
          return button;
        },
      },
      {
        field: "state", headerName: "审核状态", minWidth: 110, flex: 1,
      },
      {
        field: "reviewNote", headerName: "审核备注",
        minWidth: 125, flex: 1,
      },
    ];
    this.api = createGrid<MineruAuditRow>(this.gridHost, {
      theme: calibrationTheme,
      columnDefs: columns,
      rowData: [],
      getRowId: ({ data }) => data.id,
      defaultColDef: { sortable: true, resizable: true, filter: true },
      rowHeight: 42,
      headerHeight: 38,
      suppressMovableColumns: true,
      suppressColumnVirtualisation: true,
      animateRows: false,
      onRowClicked: ({ data }) => {
        if (!data) return;
        this.selectedId = data.id;
        this.renderSelection();
        if (this.payload) this.callbacks.onInspectPdf(data, this.payload);
      },
    });
    requireElement<HTMLButtonElement>("mineru-audit-close")
      .addEventListener("click", () => this.close());
    this.kindSelect.addEventListener("change", () => this.filter());
    this.stateSelect.addEventListener("change", () => this.filter());
    this.search.addEventListener("input", () => this.filter());
    this.saveButton.addEventListener("click", () => {
      const item = this.getSelected();
      if (item) void this.save(item, this.decision.value as MineruAuditChange["decision"], this.note.value);
    });
    this.locateButton.addEventListener("click", () => {
      const item = this.getSelected();
      if (!item) return;
      const target = item.navigationTargets[Number(this.targetSelect.value)];
      if (target) this.callbacks.onLocate(target, item);
    });
  }

  get isOpen(): boolean { return this.visible; }

  close(): void {
    this.loadToken++;
    if (!this.visible) return;
    this.visible = false;
    this.host.hidden = true;
    this.callbacks.onVisibleChange(false);
  }

  async open(chapterId: string): Promise<void> {
    this.chapterId = chapterId;
    this.kindSelect.value = "";
    this.stateSelect.value = "待审核";
    this.search.value = "";
    this.selectedId = undefined;
    this.payload = undefined;
    this.api.setGridOption("rowData", []);
    this.summary.textContent = "";
    this.editor.hidden = true;
    this.status.textContent = "正在读取全书注释审计…";
    this.visible = true;
    this.host.hidden = false;
    this.callbacks.onVisibleChange(true);
    await this.reload();
  }

  private async reload(): Promise<void> {
    const requestToken = ++this.loadToken;
    try {
      const response = await fetch(
        "/__workspace/chapter/annotation-audit?chapterId=" + encodeURIComponent(this.chapterId),
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await this.errorText(response));
      const payload = await response.json() as MineruAuditPayload;
      if (requestToken !== this.loadToken || !this.visible) return;
      this.payload = payload;
      this.callbacks.onCountChange(payload);
      const previousKind = this.kindSelect.value;
      this.kindSelect.replaceChildren(new Option("全部类型", ""));
      for (const kind of Object.keys(payload.kinds)) {
        this.kindSelect.add(new Option(kind + " (" + payload.kinds[kind] + ")", kind));
      }
      this.kindSelect.value = previousKind && payload.kinds[previousKind] ? previousKind : "";
      this.status.textContent = payload.pdfAttachment?.available
        ? "单击异常行，在右侧打开原始 PDF 附件；MD 工作稿仍可修改"
        : "PDF 自动定位不可用：" + (payload.pdfAttachment?.reason || "无附件") +
          "。有可靠 MD 锚点的异常仍可定位。";
      this.filter();
    } catch (error) {
      if (requestToken !== this.loadToken || !this.visible) return;
      this.status.textContent = "无法读取审计：" + String(error);
    }
  }

  private getSelected(): MineruAuditRow | undefined {
    return this.payload?.entries.find((item) => item.id === this.selectedId);
  }

  private filter(): void {
    const payload = this.payload;
    if (!payload) return;
    const { counts, entries } = payload;
    this.summary.textContent =
      "全书 " + entries.length + " 项 · 待审核 " + counts["待审核"]
      + " · 已核查 " + counts["已核查"]
      + " · 疑似误报 " + counts["疑似误报"]
      + " · 源证据变化需复核 " + counts["需复核"];
    const search = this.search.value.trim().toLowerCase();
    const kind = this.kindSelect.value;
    const state = this.stateSelect.value;
    const filtered = entries.filter((item) =>
      (!kind || item.kind === kind)
      && (!state || item.state === state)
      && (!search || (
        item.documentKey + " " + item.summary + " " + item.detail
        + " " + (item.pageNumber ?? "") + " " + (item.pdfPageNumber ?? "")
        + " " + (item.annotationNumber ?? "")
      ).toLowerCase().includes(search)),
    );
    this.summary.textContent += " · 当前筛出 " + filtered.length + " 项";
    this.api.setGridOption("rowData", filtered);
    this.renderSelection();
  }

  private renderSelection(): void {
    const selected = this.getSelected();
    if (!selected) {
      this.editor.hidden = true;
      return;
    }
    this.editor.hidden = false;
    this.evidence.textContent =
      selected.kind + " · " + selected.summary + "\n"
      + selected.documentKey + "\n"
      + (selected.pdfPageNumber ? "PDF 全书第 " + selected.pdfPageNumber + " 页\n" : "")
      + (selected.json ? selected.json.collection + " block " + selected.json.blockIndex + "\n" : "")
      + selected.detail
      + (selected.state === "需复核" ? "\n原文变化，上次结论已失效，需重新核查" : "")
      + (selected.candidateLocations.length
        ? "\n歧义候选：" + selected.candidateLocations.map((loc) =>
          loc.chapterPath + " 行 " + (loc.lineIndex + 1)).join("、") : "");
    this.decision.value = selected.state === "需复核" ? "待审核" : selected.state;
    this.note.value = selected.reviewNote;
    this.targetSelect.replaceChildren();
    selected.navigationTargets.forEach((target, index) => this.targetSelect.add(new Option(
      "MD " + target.chapterId + " 行 " + (target.lineIndex + 1), String(index),
    )));
    this.targetSelect.hidden = selected.navigationTargets.length === 0;
    this.locateButton.hidden = selected.navigationTargets.length === 0;
  }

  private async save(
    item: MineruAuditRow,
    decision: MineruAuditChange["decision"],
    note: string,
  ): Promise<void> {
    if (!this.payload || this.busy) return;
    this.busy = true;
    this.status.textContent = "正在保存审核…";
    const change: MineruAuditChange = {
      id: item.id,
      expectedProjectId: this.payload.projectId,
      decision, note,
      sourceFingerprint: this.payload.sourceFingerprint,
      expectedRevision: this.payload.revision,
    };
    try {
      const response = await fetch("/__workspace/chapter/annotation-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId: this.chapterId, change }),
      });
      if (!response.ok) throw new Error(await this.errorText(response));
      this.payload = await response.json() as MineruAuditPayload;
      this.callbacks.onCountChange(this.payload);
      this.status.textContent = "已保存审核。原始证据仍保留。";
      this.filter();
    } catch (error) {
      this.status.textContent = "审核未写入：" + String(error);
      await this.reload();
    } finally {
      this.busy = false;
    }
  }

  private async errorText(response: Response): Promise<string> {
    try {
      const json = await response.json() as { error?: string };
      return json.error ?? "HTTP " + response.status;
    } catch {
      return "HTTP " + response.status;
    }
  }
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing #" + id);
  return element as T;
}
