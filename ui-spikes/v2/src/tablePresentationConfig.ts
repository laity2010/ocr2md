export type TablePresentationModule =
  | "章节标题"
  | "注释"
  | "嵌入块"
  | "非法断行"
  | "变动行"
  | "章节定界"
  | "翻译";

export type TableColumnId =
  | "sourceLine"
  | "lineType"
  | "annotationNumber"
  | "annotationPairStatus"
  | "embedNumber"
  | "chapterFile"
  | "preview"
  | "chapterHeadingPreview"
  | "illegalBreakContext"
  | "illegalBreakMerged"
  | "breakReason"
  | "changeOwner"
  | "changedContent"
  | "baselineContent"
  | "translationSource"
  | "translationDeepL"
  | "translationOpenAI";

export type TablePinned = "left" | "right" | null;
export type TableSortDirection = "asc" | "desc";

export interface TableColumnPresentation {
  width?: number;
  minWidth?: number;
  flex?: number;
  hidden?: boolean;
  pinned?: TablePinned;
}

export interface TableSortRule {
  column: string;
  direction?: TableSortDirection;
}

export interface TableModulePresentation {
  columns: string[];
  sort?: Array<string | TableSortRule>;
  columnStyles?: Record<string, TableColumnPresentation>;
}

export interface TablePresentationConfig {
  version: 1;
  modules: Partial<Record<TablePresentationModule, TableModulePresentation>>;
}

export interface ResolvedTableSortRule {
  colId: TableColumnId;
  direction: TableSortDirection;
}

export interface ResolvedTableColumnPresentation extends TableColumnPresentation {
  colId: TableColumnId;
  label: string;
}

export interface ResolvedTableModulePresentation {
  module: TablePresentationModule;
  columns: ResolvedTableColumnPresentation[];
  sort: ResolvedTableSortRule[];
}

export interface TablePresentationParseResult {
  ok: boolean;
  config?: TablePresentationConfig;
  resolved?: Record<TablePresentationModule, ResolvedTableModulePresentation>;
  errors: string[];
}

const COLUMN_LABELS: Record<TableColumnId, string> = {
  sourceLine: "行号",
  lineType: "行类型",
  annotationNumber: "注释号",
  annotationPairStatus: "配对状态",
  embedNumber: "组号",
  chapterFile: "章节文件",
  preview: "预览",
  chapterHeadingPreview: "标题预览",
  illegalBreakContext: "预览（前10 + 后10）",
  illegalBreakMerged: "合并预览",
  breakReason: "判断",
  changeOwner: "归属模块",
  changedContent: "变动内容",
  baselineContent: "原稿内容",
  translationSource: "原文",
  translationDeepL: "DeepL",
  translationOpenAI: "GPT",
};

const MODULE_COLUMNS: Record<TablePresentationModule, readonly TableColumnId[]> = {
  章节标题: ["sourceLine", "lineType", "chapterHeadingPreview"],
  注释: [
    "sourceLine",
    "lineType",
    "annotationNumber",
    "preview",
    "annotationPairStatus",
  ],
  嵌入块: ["sourceLine", "lineType", "embedNumber", "preview"],
  非法断行: [
    "sourceLine",
    "lineType",
    "illegalBreakContext",
    "illegalBreakMerged",
    "breakReason",
  ],
  变动行: [
    "sourceLine",
    "lineType",
    "changeOwner",
    "changedContent",
    "baselineContent",
  ],
  章节定界: ["sourceLine", "lineType", "chapterFile", "preview"],
  翻译: [
    "sourceLine",
    "lineType",
    "translationSource",
    "translationDeepL",
    "translationOpenAI",
  ],
};

const DEFAULT_STYLES: Partial<Record<TableColumnId, TableColumnPresentation>> = {
  sourceLine: { width: 82, minWidth: 72, pinned: "left" },
  lineType: { width: 150, minWidth: 130 },
  annotationNumber: { width: 92, minWidth: 82 },
  annotationPairStatus: { width: 112, minWidth: 100 },
  embedNumber: { width: 78, minWidth: 68 },
  chapterFile: { width: 240, minWidth: 200 },
  preview: { minWidth: 360, flex: 1 },
  chapterHeadingPreview: { minWidth: 360, flex: 1 },
  illegalBreakContext: { minWidth: 300, flex: 1 },
  illegalBreakMerged: { minWidth: 320, flex: 1 },
  breakReason: { minWidth: 220, flex: 1 },
  changeOwner: { width: 120, minWidth: 110 },
  changedContent: { minWidth: 360, flex: 1 },
  baselineContent: { minWidth: 300, flex: 1 },
  translationSource: { minWidth: 320, flex: 1 },
  translationDeepL: { minWidth: 300, flex: 1 },
  translationOpenAI: { minWidth: 300, flex: 1 },
};

function labelsForModule(module: TablePresentationModule): Record<string, TableColumnId> {
  return Object.fromEntries(
    MODULE_COLUMNS[module].map((colId) => [COLUMN_LABELS[colId], colId]),
  );
}

function defaultModule(module: TablePresentationModule): TableModulePresentation {
  const columns = MODULE_COLUMNS[module].map((colId) => COLUMN_LABELS[colId]);
  const styles: Record<string, TableColumnPresentation> = {};
  for (const colId of MODULE_COLUMNS[module]) {
    const style = DEFAULT_STYLES[colId];
    if (style) styles[COLUMN_LABELS[colId]] = { ...style };
  }

  if (module === "嵌入块") {
    styles["行号"] = { ...styles["行号"], pinned: null };
  }
  if (module === "变动行") {
    styles["行类型"] = { width: 100, minWidth: 90 };
  }

  const sort =
    module === "注释"
      ? ["注释号", "行号"]
      : module === "嵌入块"
        ? ["组号", "行号"]
        : ["行号"];

  return { columns, sort, columnStyles: styles };
}

export const TABLE_PRESENTATION_DEFAULT: TablePresentationConfig = {
  version: 1,
  modules: {
    章节标题: defaultModule("章节标题"),
    注释: defaultModule("注释"),
    嵌入块: defaultModule("嵌入块"),
    非法断行: defaultModule("非法断行"),
    变动行: defaultModule("变动行"),
    章节定界: defaultModule("章节定界"),
    翻译: defaultModule("翻译"),
  },
};

export const TABLE_PRESENTATION_DEFAULT_SOURCE =
  JSON.stringify(TABLE_PRESENTATION_DEFAULT, null, 2) + "\n";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateStyle(
  module: string,
  label: string,
  value: unknown,
  errors: string[],
): TableColumnPresentation | undefined {
  if (!isObject(value)) {
    errors.push(`${module}.columnStyles.${label} 必须是对象`);
    return undefined;
  }

  const allowed = new Set(["width", "minWidth", "flex", "hidden", "pinned"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(`${module}.columnStyles.${label} 不支持属性 ${key}`);
    }
  }

  const result: TableColumnPresentation = {};
  for (const key of ["width", "minWidth", "flex"] as const) {
    if (value[key] === undefined) continue;
    if (
      typeof value[key] !== "number"
      || !Number.isFinite(value[key])
      || value[key] <= 0
    ) {
      errors.push(`${module}.columnStyles.${label}.${key} 必须是正数`);
    } else {
      result[key] = value[key];
    }
  }

  if (value.hidden !== undefined) {
    if (typeof value.hidden !== "boolean") {
      errors.push(`${module}.columnStyles.${label}.hidden 必须是 boolean`);
    } else {
      result.hidden = value.hidden;
    }
  }

  if (value.pinned !== undefined) {
    if (
      value.pinned !== null
      && value.pinned !== "left"
      && value.pinned !== "right"
    ) {
      errors.push(`${module}.columnStyles.${label}.pinned 只能是 left/right/null`);
    } else {
      result.pinned = value.pinned as TablePinned;
    }
  }

  return result;
}

function resolveModule(
  module: TablePresentationModule,
  input: unknown,
  errors: string[],
): ResolvedTableModulePresentation {
  const fallback = defaultModule(module);
  const raw = isObject(input) ? input : fallback;
  if (input !== undefined && !isObject(input)) {
    errors.push(`${module} 配置必须是对象`);
  }

  const labels = labelsForModule(module);
  const columnsRaw = Array.isArray(raw.columns) ? raw.columns : fallback.columns;
  if (!Array.isArray(raw.columns) && raw.columns !== undefined) {
    errors.push(`${module}.columns 必须是字符串数组`);
  }

  const seen = new Set<string>();
  const orderedIds: TableColumnId[] = [];
  for (const entry of columnsRaw) {
    if (typeof entry !== "string") {
      errors.push(`${module}.columns 只能包含列名字符串`);
      continue;
    }
    const colId = labels[entry];
    if (!colId) {
      errors.push(`${module}.columns 包含未知列：${entry}`);
      continue;
    }
    if (seen.has(entry)) {
      errors.push(`${module}.columns 重复列：${entry}`);
      continue;
    }
    seen.add(entry);
    orderedIds.push(colId);
  }

  for (const colId of MODULE_COLUMNS[module]) {
    const label = COLUMN_LABELS[colId];
    if (!seen.has(label)) orderedIds.push(colId);
  }

  const styleInput = isObject(raw.columnStyles) ? raw.columnStyles : {};
  if (raw.columnStyles !== undefined && !isObject(raw.columnStyles)) {
    errors.push(`${module}.columnStyles 必须是对象`);
  }

  const styleById = new Map<TableColumnId, TableColumnPresentation>();
  for (const [label, value] of Object.entries(styleInput)) {
    const colId = labels[label];
    if (!colId) {
      errors.push(`${module}.columnStyles 包含未知列：${label}`);
      continue;
    }
    const style = validateStyle(module, label, value, errors);
    if (style) styleById.set(colId, style);
  }

  const columns = orderedIds.map((colId) => ({
    colId,
    label: COLUMN_LABELS[colId],
    ...(DEFAULT_STYLES[colId] ?? {}),
    ...(module === "嵌入块" && colId === "sourceLine" ? { pinned: null } : {}),
    ...(styleById.get(colId) ?? {}),
  }));

  const sortInput = Array.isArray(raw.sort) ? raw.sort : fallback.sort ?? [];
  if (raw.sort !== undefined && !Array.isArray(raw.sort)) {
    errors.push(`${module}.sort 必须是数组`);
  }

  const sort: ResolvedTableSortRule[] = [];
  const sortSeen = new Set<TableColumnId>();
  for (const entry of sortInput) {
    const label =
      typeof entry === "string"
        ? entry
        : isObject(entry) && typeof entry.column === "string"
          ? entry.column
          : undefined;
    const direction =
      isObject(entry) && entry.direction !== undefined
        ? entry.direction
        : "asc";
    if (!label) {
      errors.push(`${module}.sort 项必须是列名或 {column,direction}`);
      continue;
    }
    const colId = labels[label];
    if (!colId) {
      errors.push(`${module}.sort 包含未知列：${label}`);
      continue;
    }
    if (direction !== "asc" && direction !== "desc") {
      errors.push(`${module}.sort.${label} direction 只能是 asc/desc`);
      continue;
    }
    if (sortSeen.has(colId)) {
      errors.push(`${module}.sort 重复列：${label}`);
      continue;
    }
    sortSeen.add(colId);
    sort.push({ colId, direction });
  }

  return { module, columns, sort };
}

export function resolveTablePresentationConfig(
  config: TablePresentationConfig,
): {
  resolved: Record<TablePresentationModule, ResolvedTableModulePresentation>;
  errors: string[];
} {
  const errors: string[] = [];
  const modules = config.modules ?? {};
  const moduleNames = Object.keys(MODULE_COLUMNS) as TablePresentationModule[];
  const resolved = Object.fromEntries(
    moduleNames.map((module) => [
      module,
      resolveModule(module, modules[module], errors),
    ]),
  ) as Record<TablePresentationModule, ResolvedTableModulePresentation>;
  return { resolved, errors };
}

export function parseTablePresentationConfig(
  source: string,
): TablePresentationParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const positionMatch = /position\s+(\d+)/i.exec(message);
    let location = "";
    if (positionMatch) {
      const position = Number(positionMatch[1]);
      const prefix = source.slice(0, position);
      const lines = prefix.split("\n");
      location = `（第 ${lines.length} 行，第 ${(lines.at(-1)?.length ?? 0) + 1} 列）`;
    }
    return {
      ok: false,
      errors: [`JSON 解析失败${location}：${message}`],
    };
  }

  if (!isObject(parsed)) {
    return { ok: false, errors: ["表格配置根节点必须是对象"] };
  }
  if (parsed.version !== 1) {
    return { ok: false, errors: ["version 必须为 1"] };
  }
  if (!isObject(parsed.modules)) {
    return { ok: false, errors: ["modules 必须是对象"] };
  }

  const knownModules = new Set(Object.keys(MODULE_COLUMNS));
  const errors: string[] = [];
  for (const module of Object.keys(parsed.modules)) {
    if (!knownModules.has(module)) {
      errors.push(`未知模块：${module}`);
    }
  }

  const config = parsed as unknown as TablePresentationConfig;
  const resolved = resolveTablePresentationConfig(config);
  errors.push(...resolved.errors);
  return {
    ok: errors.length === 0,
    config: errors.length === 0 ? config : undefined,
    resolved: errors.length === 0 ? resolved.resolved : undefined,
    errors,
  };
}

export function resolveDefaultTablePresentation():
  Record<TablePresentationModule, ResolvedTableModulePresentation> {
  const result = resolveTablePresentationConfig(TABLE_PRESENTATION_DEFAULT);
  if (result.errors.length) {
    throw new Error(result.errors.join("; "));
  }
  return result.resolved;
}
