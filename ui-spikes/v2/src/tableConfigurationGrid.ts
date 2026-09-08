import {
  AllCommunityModule,
  type ColDef,
  type ICellRendererParams,
  type IDoesFilterPassParams,
  type IFilterComp,
  type IFilterParams,
  ModuleRegistry,
  type RowClickedEvent,
  createGrid,
} from "ag-grid-community";
import { calibrationTheme } from "./calibrationGrid";
import {
  TABLE_PRESENTATION_SETTINGS,
  tablePresentationEntryKey,
  tablePresentationEntryValue,
  type TablePresentationConfig,
  type TablePresentationSettingDescriptor,
} from "./tablePresentationConfig";

ModuleRegistry.registerModules([AllCommunityModule]);

export interface TableConfigurationRow {
  id: string;
  control: string;
  functionGroup: string;
  key: string;
  valuePreview: string;
  description: string;
  kind: "boolean" | "json";
  booleanValue?: boolean;
  descriptor: TablePresentationSettingDescriptor;
}

class EnumCheckboxFilter implements IFilterComp<TableConfigurationRow> {
  private params!: IFilterParams<TableConfigurationRow>;
  private readonly gui = document.createElement("div");
  private selected: Set<string> | null = null;
  private values: string[] = [];

  init(params: IFilterParams<TableConfigurationRow>): void {
    this.params = params;
    this.gui.className = "config-enum-filter";
    this.refreshValues();
    this.render();
  }

  getGui(): HTMLElement {
    return this.gui;
  }

  isFilterActive(): boolean {
    return this.selected !== null;
  }

  doesFilterPass(params: IDoesFilterPassParams<TableConfigurationRow>): boolean {
    if (this.selected === null) return true;
    const value = String(this.params.getValue(params.node) ?? "");
    return this.selected.has(value);
  }

  getModel(): { values: string[] } | null {
    return this.selected === null
      ? null
      : { values: [...this.selected] };
  }

  setModel(model: { values?: string[] } | null): void {
    this.selected = model?.values ? new Set(model.values) : null;
    this.refreshValues();
    this.render();
  }

  afterGuiAttached(): void {
    this.refreshValues();
    this.render();
  }

  onNewRowsLoaded(): void {
    this.refreshValues();
    this.normaliseSelection();
    this.render();
  }

  private refreshValues(): void {
    const values = new Set<string>();
    this.params.api.forEachLeafNode((node) => {
      values.add(String(this.params.getValue(node) ?? ""));
    });
    this.values = [...values].sort((left, right) =>
      left.localeCompare(right, "zh-CN"),
    );
  }

  private normaliseSelection(): void {
    if (this.selected === null) return;
    const available = new Set(this.values);
    this.selected = new Set(
      [...this.selected].filter((value) => available.has(value)),
    );
    if (
      this.values.length > 0
      && this.selected.size === this.values.length
    ) {
      this.selected = null;
    }
  }

  private render(): void {
    this.gui.replaceChildren();

    const allLabel = document.createElement("label");
    allLabel.className = "config-enum-filter-option config-enum-filter-all";
    const allInput = document.createElement("input");
    allInput.type = "checkbox";
    allInput.checked = this.selected === null;
    allInput.setAttribute("aria-label", "All");
    const allText = document.createElement("span");
    allText.textContent = "All";
    allInput.addEventListener("change", () => {
      this.selected = allInput.checked ? null : new Set<string>();
      this.params.filterChangedCallback();
      this.render();
    });
    allLabel.append(allInput, allText);
    this.gui.append(allLabel);

    const divider = document.createElement("div");
    divider.className = "config-enum-filter-divider";
    this.gui.append(divider);

    for (const value of this.values) {
      const label = document.createElement("label");
      label.className = "config-enum-filter-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked =
        this.selected === null || this.selected.has(value);
      input.setAttribute("aria-label", value);
      const text = document.createElement("span");
      text.textContent = value;
      input.addEventListener("change", () => {
        const next =
          this.selected === null
            ? new Set(this.values)
            : new Set(this.selected);
        if (input.checked) next.add(value);
        else next.delete(value);
        this.selected =
          next.size === this.values.length ? null : next;
        this.params.filterChangedCallback();
        this.render();
      });
      label.append(input, text);
      this.gui.append(label);
    }
  }
}

export class TableConfigurationGrid {
  private config: TablePresentationConfig | undefined;
  private readonly api;

  constructor(
    host: HTMLElement,
    private readonly onActivate: (
      descriptor: TablePresentationSettingDescriptor,
    ) => void,
    private readonly onBooleanChanged: (
      descriptor: TablePresentationSettingDescriptor,
      checked: boolean,
    ) => void,
  ) {
    this.api = createGrid<TableConfigurationRow>(host, {
      theme: calibrationTheme,
      rowData: [],
      columnDefs: this.columnDefs(),
      defaultColDef: {
        sortable: true,
        resizable: true,
        suppressMovable: true,
      },
      suppressMovableColumns: true,
      rowHeight: 46,
      headerHeight: 38,
      animateRows: false,
      getRowId: (params) => params.data.id,
      onRowClicked: (event: RowClickedEvent<TableConfigurationRow>) => {
        if (!event.data) return;
        this.onActivate(event.data.descriptor);
      },
    });
  }

  setConfig(config: TablePresentationConfig): void {
    this.config = structuredClone(config);
    this.api.setGridOption("rowData", this.rows());
    this.api.refreshCells({ force: true });
  }

  rowCount(): number {
    return this.config?.配置.length ?? TABLE_PRESENTATION_SETTINGS.length;
  }

  private rows(): TableConfigurationRow[] {
    const entries = this.config?.配置 ?? [];
    return entries.flatMap((entry) => {
      const key = tablePresentationEntryKey(entry);
      if (!key) return [];
      const value = tablePresentationEntryValue(entry);
      const descriptor = TABLE_PRESENTATION_SETTINGS.find(
        (candidate) =>
          candidate.control === entry.控件
          && candidate.key === key,
      );
      if (!descriptor) return [];

      return [{
        id: descriptor.id,
        control: entry.控件,
        functionGroup: entry.功能组 || "通用",
        key,
        valuePreview: configurationValuePreview(value),
        description: entry.中文描述,
        kind: descriptor.kind,
        booleanValue:
          descriptor.kind === "boolean" ? value === true : undefined,
        descriptor,
      }];
    });
  }

  private columnDefs(): ColDef<TableConfigurationRow>[] {
    return [
      {
        field: "control",
        headerName: "控件",
        width: 150,
        minWidth: 130,
        pinned: "left",
        filter: EnumCheckboxFilter,
        suppressHeaderMenuButton: true,
      },
      {
        field: "functionGroup",
        headerName: "功能组",
        width: 110,
        minWidth: 96,
        filter: EnumCheckboxFilter,
        suppressHeaderMenuButton: true,
      },
      {
        field: "key",
        headerName: "键名",
        width: 170,
        minWidth: 140,
        filter: EnumCheckboxFilter,
        suppressHeaderMenuButton: true,
      },
      {
        colId: "value",
        headerName: "值",
        minWidth: 220,
        flex: 1,
        cellRenderer: (
          params: ICellRendererParams<TableConfigurationRow, unknown>,
        ) => this.valueRenderer(params),
      },
      {
        field: "description",
        headerName: "中文描述",
        minWidth: 180,
        flex: 1,
      },
    ];
  }

  private valueRenderer(
    params: ICellRendererParams<TableConfigurationRow, unknown>,
  ): HTMLElement {
    const row = params.data;
    const container = document.createElement("div");
    container.className = "config-grid-value";
    if (!row) return container;

    if (row.kind === "boolean") {
      const label = document.createElement("label");
      label.className = "config-grid-toggle";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = row.booleanValue === true;
      input.setAttribute("aria-label", row.description || row.key);
      const state = document.createElement("span");
      state.textContent = input.checked ? "true" : "false";
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        state.textContent = input.checked ? "true" : "false";
        this.onBooleanChanged(row.descriptor, input.checked);
      });
      label.append(input, state);
      container.append(label);
      return container;
    }

    container.textContent = row.valuePreview;
    container.title = row.valuePreview;
    return container;
  }
}

export function configurationValuePreview(value: unknown): string {
  const serialized = JSON.stringify(value);
  const sourceValue =
    serialized === undefined ? String(value) : serialized;

  if (!Array.isArray(value) || sourceValue.length <= 50) {
    return sourceValue;
  }
  return sourceValue.slice(0, 49) + "…";
}
