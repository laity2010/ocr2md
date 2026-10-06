export type TablePresentationModule =
  | "章节标题"
  | "注释"
  | "嵌入块"
  | "非法断行"
  | "媒体"
  | "变动行"
  | "章节定界"
  | "文本块"
  | "句子"
  | "翻译";

export type TableColumnId =
  | "sourceLine"
  | "lineType"
  | "annotationNumber"
  | "annotationPairStatus"
  | "embedNumber"
  | "chapterStandalone"
  | "chapterFile"
  | "preview"
  | "chapterHeadingPreview"
  | "illegalBreakContext"
  | "illegalBreakMerged"
  | "breakReason"
  | "mediaGroup"
  | "mediaThumbnail"
  | "mediaFileName"
  | "mediaSize"
  | "changeOwner"
  | "changedContent"
  | "baselineContent"
  | "sentenceSource"
  | "translationInput"
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

export interface SourceEditorPresentation {
  showHardReturns: boolean;
  hardReturnColor: string;
}

export type TablePresentationSettingKind = "boolean" | "json";

export interface TablePresentationSettingDescriptor {
  id: string;
  control: string;
  functionGroup: string;
  key: string;
  description: string;
  legacyPath: string[];
  kind: TablePresentationSettingKind;
  keywords: string[];
}

export interface TablePresentationEntry {
  控件: string;
  功能组: string;
  键值: Record<string, unknown>;
  中文描述: string;
}

export interface TablePresentationConfig {
  版本: 2;
  配置: TablePresentationEntry[];
}

interface LegacyTablePresentationConfig {
  version: 1;
  sourceEditor?: Partial<SourceEditorPresentation>;
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
  sourceEditor?: SourceEditorPresentation;
  migratedFromLegacy?: boolean;
  errors: string[];
}

const COLUMN_LABELS: Record<TableColumnId, string> = {
  sourceLine: "行号",
  lineType: "行类型",
  annotationNumber: "注释号",
  annotationPairStatus: "配对状态",
  embedNumber: "组号",
  chapterStandalone: "单独成章",
  chapterFile: "章节文件",
  preview: "预览",
  chapterHeadingPreview: "标题预览",
  illegalBreakContext: "预览（前10 + 后10）",
  illegalBreakMerged: "合并预览",
  breakReason: "判断",
  mediaGroup: "分组",
  mediaThumbnail: "缩略图",
  mediaFileName: "文件名",
  mediaSize: "大小",
  changeOwner: "归属模块",
  changedContent: "变动内容",
  baselineContent: "原稿内容",
  sentenceSource: "原文",
  translationInput: "翻译输入",
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
  媒体: ["mediaGroup", "mediaThumbnail", "mediaFileName", "mediaSize"],
  变动行: [
    "sourceLine",
    "lineType",
    "changeOwner",
    "changedContent",
    "baselineContent",
  ],
  章节定界: ["sourceLine", "lineType", "chapterStandalone", "chapterFile", "preview"],
  文本块: ["sourceLine", "lineType", "preview"],
  句子: ["sourceLine", "lineType", "sentenceSource"],
  翻译: [
    "sourceLine",
    "lineType",
    "translationSource",
    "translationDeepL",
    "translationOpenAI",
  ],
};

const MODULE_NAMES = Object.keys(MODULE_COLUMNS) as TablePresentationModule[];

export const TABLE_PRESENTATION_SETTINGS: TablePresentationSettingDescriptor[] = [
  {
    id: "sourceEditor.showHardReturns",
    control: "源码窗口",
    functionGroup: "通用",
    key: "showHardReturns",
    description: "显示硬回车",
    legacyPath: ["sourceEditor", "showHardReturns"],
    kind: "boolean",
    keywords: ["硬回车", "回车", "换行", "源码", "source", "return"],
  },
  {
    id: "sourceEditor.hardReturnColor",
    control: "源码窗口",
    functionGroup: "通用",
    key: "hardReturnColor",
    description: "硬回车颜色",
    legacyPath: ["sourceEditor", "hardReturnColor"],
    kind: "json",
    keywords: ["硬回车", "颜色", "源码", "color", "return"],
  },
  ...MODULE_NAMES.flatMap((module) => [
    {
      id: "modules." + module + ".columns",
      control: module + "数据表",
      functionGroup: "通用",
      key: "columns",
      description: "列顺序",
      legacyPath: ["modules", module, "columns"],
      kind: "json" as const,
      keywords: [module, "列", "列序", "顺序", "columns"],
    },
    {
      id: "modules." + module + ".sort",
      control: module + "数据表",
      functionGroup: "通用",
      key: "sort",
      description: "默认排序",
      legacyPath: ["modules", module, "sort"],
      kind: "json" as const,
      keywords: [module, "排序", "默认排序", "sort"],
    },
    {
      id: "modules." + module + ".columnStyles",
      control: module + "数据表",
      functionGroup: "通用",
      key: "columnStyles",
      description: "列样式",
      legacyPath: ["modules", module, "columnStyles"],
      kind: "json" as const,
      keywords: [module, "列宽", "宽度", "隐藏", "固定", "pin", "style"],
    },
  ]),
];

const DEFAULT_STYLES: Partial<Record<TableColumnId, TableColumnPresentation>> = {
  sourceLine: { width: 82, minWidth: 72, pinned: "left" },
  lineType: { width: 150, minWidth: 130 },
  annotationNumber: { width: 92, minWidth: 82 },
  annotationPairStatus: { width: 112, minWidth: 100 },
  embedNumber: { width: 78, minWidth: 68 },
  chapterStandalone: { width: 118, minWidth: 108 },
  chapterFile: { width: 240, minWidth: 200 },
  preview: { minWidth: 360, flex: 1 },
  chapterHeadingPreview: { minWidth: 360, flex: 1 },
  illegalBreakContext: { minWidth: 300, flex: 1 },
  illegalBreakMerged: { minWidth: 320, flex: 1 },
  breakReason: { minWidth: 220, flex: 1 },
  mediaGroup: { width: 108, minWidth: 96, pinned: "left" },
  mediaThumbnail: { width: 104, minWidth: 96 },
  mediaFileName: { minWidth: 280, flex: 1 },
  mediaSize: { width: 110, minWidth: 96 },
  changeOwner: { width: 120, minWidth: 110 },
  changedContent: { minWidth: 360, flex: 1 },
  baselineContent: { minWidth: 300, flex: 1 },
  sentenceSource: { minWidth: 320, flex: 1 },
  translationInput: { minWidth: 360, flex: 1 },
  translationSource: { minWidth: 320, flex: 1 },
  translationDeepL: { minWidth: 300, flex: 1 },
  translationOpenAI: { minWidth: 300, flex: 1 },
};

function labelsForModule(
  module: TablePresentationModule,
): Record<string, TableColumnId> {
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

  if (module === "变动行") {
    styles["行类型"] = { width: 100, minWidth: 90 };
  }

  const sort =
    module === "注释"
      ? ["注释号", "行号"]
      : module === "嵌入块"
        ? ["组号", "行号"]
        : module === "媒体"
          ? ["分组", "文件名"]
          : ["行号"];

  return { columns, sort, columnStyles: styles };
}

const LEGACY_TABLE_PRESENTATION_DEFAULT: LegacyTablePresentationConfig = {
  version: 1,
  sourceEditor: {
    showHardReturns: true,
    hardReturnColor: "#9aa79d",
  },
  modules: {
    章节标题: defaultModule("章节标题"),
    注释: defaultModule("注释"),
    嵌入块: defaultModule("嵌入块"),
    非法断行: defaultModule("非法断行"),
    媒体: defaultModule("媒体"),
    变动行: defaultModule("变动行"),
    章节定界: defaultModule("章节定界"),
    文本块: defaultModule("文本块"),
    句子: defaultModule("句子"),
    翻译: defaultModule("翻译"),
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function valueAtPath(
  root: unknown,
  path: readonly string[],
): unknown {
  let value = root;
  for (const segment of path) {
    if (!isObject(value)) return undefined;
    value = value[segment];
  }
  return value;
}

function setValueAtPath(
  root: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): void {
  let target = root;
  for (const segment of path.slice(0, -1)) {
    const existing = target[segment];
    if (!isObject(existing)) target[segment] = {};
    target = target[segment] as Record<string, unknown>;
  }
  target[path.at(-1) ?? ""] = cloneValue(value);
}

function descriptorForEntry(
  control: string,
  key: string,
): TablePresentationSettingDescriptor | undefined {
  return TABLE_PRESENTATION_SETTINGS.find(
    (descriptor) =>
      descriptor.control === control
      && descriptor.key === key,
  );
}

export function tablePresentationEntryKey(
  entry: TablePresentationEntry,
): string | undefined {
  return Object.keys(entry.键值)[0];
}

export function tablePresentationEntryValue(
  entry: TablePresentationEntry,
): unknown {
  const key = tablePresentationEntryKey(entry);
  return key === undefined ? undefined : entry.键值[key];
}

function configFromLegacy(
  legacy: LegacyTablePresentationConfig,
): TablePresentationConfig {
  return {
    版本: 2,
    配置: TABLE_PRESENTATION_SETTINGS.map((descriptor) => ({
      控件: descriptor.control,
      功能组: descriptor.functionGroup,
      键值: {
        [descriptor.key]: cloneValue(
          valueAtPath(legacy, descriptor.legacyPath)
            ?? valueAtPath(
              LEGACY_TABLE_PRESENTATION_DEFAULT,
              descriptor.legacyPath,
            ),
        ),
      },
      中文描述: descriptor.description,
    })),
  };
}

function legacyFromConfig(
  config: TablePresentationConfig,
  errors: string[],
): LegacyTablePresentationConfig {
  const legacy: LegacyTablePresentationConfig = {
    version: 1,
    modules: {},
  };

  const seen = new Set<string>();
  for (const entry of config.配置) {
    const key = tablePresentationEntryKey(entry);
    if (!key) {
      errors.push("配置键值必须且只能包含一个键");
      continue;
    }
    const descriptor = descriptorForEntry(entry.控件, key);
    if (!descriptor) {
      errors.push("未知配置：" + entry.控件 + " / " + key);
      continue;
    }
    if (seen.has(descriptor.id)) {
      errors.push("重复配置：" + entry.控件 + " / " + key);
      continue;
    }
    seen.add(descriptor.id);
    setValueAtPath(
      legacy as unknown as Record<string, unknown>,
      descriptor.legacyPath,
      tablePresentationEntryValue(entry),
    );
  }
  return legacy;
}

export const TABLE_PRESENTATION_DEFAULT: TablePresentationConfig =
  configFromLegacy(LEGACY_TABLE_PRESENTATION_DEFAULT);

export const TABLE_PRESENTATION_DEFAULT_SOURCE =
  JSON.stringify(TABLE_PRESENTATION_DEFAULT, null, 2) + "\n";

function validateStyle(
  module: string,
  label: string,
  value: unknown,
  errors: string[],
): TableColumnPresentation | undefined {
  if (!isObject(value)) {
    errors.push(module + ".columnStyles." + label + " 必须是对象");
    return undefined;
  }

  const allowed = new Set(["width", "minWidth", "flex", "hidden", "pinned"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(
        module + ".columnStyles." + label + " 不支持属性 " + key,
      );
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
      errors.push(
        module + ".columnStyles." + label + "." + key + " 必须是正数",
      );
    } else {
      result[key] = value[key];
    }
  }

  if (value.hidden !== undefined) {
    if (typeof value.hidden !== "boolean") {
      errors.push(
        module + ".columnStyles." + label + ".hidden 必须是 boolean",
      );
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
      errors.push(
        module + ".columnStyles." + label
          + ".pinned 只能是 left/right/null",
      );
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
    errors.push(module + " 配置必须是对象");
  }

  const labels = labelsForModule(module);
  const columnsRaw = Array.isArray(raw.columns) ? raw.columns : fallback.columns;
  if (!Array.isArray(raw.columns) && raw.columns !== undefined) {
    errors.push(module + ".columns 必须是字符串数组");
  }

  const seen = new Set<string>();
  const orderedIds: TableColumnId[] = [];
  for (const entry of columnsRaw) {
    if (typeof entry !== "string") {
      errors.push(module + ".columns 只能包含列名字符串");
      continue;
    }
    const colId = labels[entry];
    if (!colId) {
      errors.push(module + ".columns 包含未知列：" + entry);
      continue;
    }
    if (seen.has(entry)) {
      errors.push(module + ".columns 重复列：" + entry);
      continue;
    }
    seen.add(entry);
    orderedIds.push(colId);
  }

  if (module === "章节定界" && !seen.has("单独成章")) {
    const chapterFileIndex = orderedIds.indexOf("chapterFile");
    orderedIds.splice(
      chapterFileIndex >= 0 ? chapterFileIndex : orderedIds.length,
      0,
      "chapterStandalone",
    );
    seen.add("单独成章");
  }
  for (const colId of MODULE_COLUMNS[module]) {
    const label = COLUMN_LABELS[colId];
    if (!seen.has(label)) orderedIds.push(colId);
  }

  const styleInput = isObject(raw.columnStyles) ? raw.columnStyles : {};
  if (raw.columnStyles !== undefined && !isObject(raw.columnStyles)) {
    errors.push(module + ".columnStyles 必须是对象");
  }

  const styleById = new Map<TableColumnId, TableColumnPresentation>();
  for (const [label, value] of Object.entries(styleInput)) {
    const colId = labels[label];
    if (!colId) {
      errors.push(module + ".columnStyles 包含未知列：" + label);
      continue;
    }
    const style = validateStyle(module, label, value, errors);
    if (style) styleById.set(colId, style);
  }

  const columns = orderedIds.map((colId) => ({
    colId,
    label: COLUMN_LABELS[colId],
    ...(DEFAULT_STYLES[colId] ?? {}),
    ...(styleById.get(colId) ?? {}),
    ...(module === "嵌入块" && colId === "sourceLine" ? { pinned: "left" as const } : {}),
  }));

  const sortInput = Array.isArray(raw.sort) ? raw.sort : fallback.sort ?? [];
  if (raw.sort !== undefined && !Array.isArray(raw.sort)) {
    errors.push(module + ".sort 必须是数组");
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
      errors.push(module + ".sort 项必须是列名或 {column,direction}");
      continue;
    }
    const colId = labels[label];
    if (!colId) {
      errors.push(module + ".sort 包含未知列：" + label);
      continue;
    }
    if (direction !== "asc" && direction !== "desc") {
      errors.push(
        module + ".sort." + label + " direction 只能是 asc/desc",
      );
      continue;
    }
    if (sortSeen.has(colId)) {
      errors.push(module + ".sort 重复列：" + label);
      continue;
    }
    sortSeen.add(colId);
    sort.push({ colId, direction });
  }

  return { module, columns, sort };
}

function resolveSourceEditorPresentation(
  legacy: LegacyTablePresentationConfig,
): {
  resolved: SourceEditorPresentation;
  errors: string[];
} {
  const errors: string[] = [];
  const raw = legacy.sourceEditor;
  if (raw !== undefined && !isObject(raw)) {
    return {
      resolved: {
        showHardReturns: true,
        hardReturnColor: "#9aa79d",
      },
      errors: ["sourceEditor 必须是对象"],
    };
  }
  if (
    raw
    && raw.showHardReturns !== undefined
    && typeof raw.showHardReturns !== "boolean"
  ) {
    errors.push("sourceEditor.showHardReturns 必须是 boolean");
  }
  if (
    raw
    && raw.hardReturnColor !== undefined
    && (
      typeof raw.hardReturnColor !== "string"
      || raw.hardReturnColor.trim().length === 0
    )
  ) {
    errors.push("sourceEditor.hardReturnColor 必须是非空字符串");
  }
  return {
    resolved: {
      showHardReturns:
        raw && typeof raw.showHardReturns === "boolean"
          ? raw.showHardReturns
          : true,
      hardReturnColor:
        raw
        && typeof raw.hardReturnColor === "string"
        && raw.hardReturnColor.trim()
          ? raw.hardReturnColor.trim()
          : "#9aa79d",
    },
    errors,
  };
}

function resolveLegacyTablePresentationConfig(
  legacy: LegacyTablePresentationConfig,
): {
  resolved: Record<TablePresentationModule, ResolvedTableModulePresentation>;
  errors: string[];
} {
  const errors: string[] = [];
  const modules = legacy.modules ?? {};
  const resolved = Object.fromEntries(
    MODULE_NAMES.map((module) => [
      module,
      resolveModule(module, modules[module], errors),
    ]),
  ) as Record<TablePresentationModule, ResolvedTableModulePresentation>;
  return { resolved, errors };
}

function parseVersion2(
  parsed: Record<string, unknown>,
): {
  config?: TablePresentationConfig;
  legacy?: LegacyTablePresentationConfig;
  errors: string[];
} {
  const errors: string[] = [];
  if (parsed["版本"] !== 2) {
    return { errors: ["版本 必须为 2"] };
  }
  if (!Array.isArray(parsed["配置"])) {
    return { errors: ["配置 必须是数组"] };
  }

  const allowed = new Set(["控件", "功能组", "键值", "中文描述"]);
  const entries: TablePresentationEntry[] = [];

  parsed["配置"].forEach((value, index) => {
    if (!isObject(value)) {
      errors.push("配置[" + index + "] 必须是对象");
      return;
    }
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) {
        errors.push("配置[" + index + "] 不支持属性 " + key);
      }
    }

    const control = value["控件"];
    const keyValue = value["键值"];
    const functionGroup =
      typeof value["功能组"] === "string" && value["功能组"].trim()
        ? value["功能组"].trim()
        : "通用";

    if (typeof control !== "string" || !control.trim()) {
      errors.push("配置[" + index + "].控件 必须是非空字符串");
      return;
    }
    if (!isObject(keyValue)) {
      errors.push("配置[" + index + "].键值 必须是对象");
      return;
    }

    const keys = Object.keys(keyValue);
    if (keys.length !== 1) {
      errors.push("配置[" + index + "].键值 必须且只能包含一个键");
      return;
    }
    const key = keys[0] ?? "";
    const descriptor = descriptorForEntry(control.trim(), key);
    if (!descriptor) {
      errors.push(
        "未知配置：" + control.trim() + " / " + key,
      );
      return;
    }

    const description =
      typeof value["中文描述"] === "string" && value["中文描述"].trim()
        ? value["中文描述"].trim()
        : descriptor.description;

    entries.push({
      控件: control.trim(),
      功能组: functionGroup,
      键值: { [key]: cloneValue(keyValue[key]) },
      中文描述: description,
    });
  });

  const config: TablePresentationConfig = {
    版本: 2,
    配置: entries,
  };
  const legacy = legacyFromConfig(config, errors);
  return {
    config: errors.length ? undefined : config,
    legacy: errors.length ? undefined : legacy,
    errors,
  };
}

function parseLegacyVersion1(
  parsed: Record<string, unknown>,
): {
  config?: TablePresentationConfig;
  legacy?: LegacyTablePresentationConfig;
  errors: string[];
} {
  if (parsed.version !== 1) {
    return { errors: ["version 必须为 1"] };
  }
  if (!isObject(parsed.modules)) {
    return { errors: ["modules 必须是对象"] };
  }

  const knownModules = new Set(MODULE_NAMES);
  const errors: string[] = [];
  for (const module of Object.keys(parsed.modules)) {
    if (!knownModules.has(module as TablePresentationModule)) {
      errors.push("未知模块：" + module);
    }
  }
  if (errors.length) return { errors };

  const legacy = parsed as unknown as LegacyTablePresentationConfig;
  return {
    config: configFromLegacy(legacy),
    legacy,
    errors,
  };
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
      location =
        "（第 " + lines.length + " 行，第 "
        + ((lines.at(-1)?.length ?? 0) + 1) + " 列）";
    }
    return {
      ok: false,
      errors: ["JSON 解析失败" + location + "：" + message],
    };
  }

  if (!isObject(parsed)) {
    return { ok: false, errors: ["配置根节点必须是对象"] };
  }

  const legacyInput = parsed.version === 1;
  const parsedShape = legacyInput
    ? parseLegacyVersion1(parsed)
    : parseVersion2(parsed);

  if (!parsedShape.config || !parsedShape.legacy || parsedShape.errors.length) {
    return {
      ok: false,
      errors: parsedShape.errors,
    };
  }

  const resolved = resolveLegacyTablePresentationConfig(parsedShape.legacy);
  const sourceEditor = resolveSourceEditorPresentation(parsedShape.legacy);
  const errors = [...resolved.errors, ...sourceEditor.errors];

  return {
    ok: errors.length === 0,
    config: errors.length === 0 ? parsedShape.config : undefined,
    resolved: errors.length === 0 ? resolved.resolved : undefined,
    sourceEditor: errors.length === 0 ? sourceEditor.resolved : undefined,
    migratedFromLegacy: legacyInput && errors.length === 0,
    errors,
  };
}

export function resolveDefaultTablePresentation():
  Record<TablePresentationModule, ResolvedTableModulePresentation> {
  const parsed = parseTablePresentationConfig(TABLE_PRESENTATION_DEFAULT_SOURCE);
  if (!parsed.ok || !parsed.resolved) {
    throw new Error(parsed.errors.join("; "));
  }
  return parsed.resolved;
}
