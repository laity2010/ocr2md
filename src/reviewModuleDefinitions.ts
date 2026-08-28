import type { ModuleName } from "./types";

export type ReviewToolbarKind =
  | "chapterBoundary"
  | "chapterTitle"
  | "annotation"
  | "embed"
  | "illegalBreak"
  | "textBlocks"
  | "sentences"
  | "translation";

export type ReviewTableKind = "standard" | "illegalBreak" | "sentenceDerived" | "translation";
export type ReviewExtraColumn = "annotationNumber" | "embedNumber" | "chapterFile";
export type ReviewPreviewKind = "plain" | "chapterHeading";
export type ReviewDetailKind = "none" | "annotationPair" | "embedDownload";

export interface ReviewFilterDefinition {
  options: string[];
  defaultValue: string;
  primaryLineTypes: string[];
  primaryOnlyLabel: string;
  combinedLabel: string;
  hideDeletedWorkingRows?: boolean;
}

export interface ReviewSortRuleDefinition {
  key: "line" | "lineType" | "preview" | "number" | "chapterFile" | "embedNumber";
  direction: "asc" | "desc";
}

export interface ReviewModuleDefinition {
  name: ModuleName;
  toolbarKind: ReviewToolbarKind;
  tableKind: ReviewTableKind;
  lineTypes: string[];
  selectable: boolean;
  bulkEdit: boolean;
  editableLineType: boolean;
  regexCard: boolean;
  previewKind: ReviewPreviewKind;
  detailKind: ReviewDetailKind;
  extraColumns: ReviewExtraColumn[];
  typeColumnLabel: string;
  countKind: "rows" | "annotationCalibrated";
  includeWorkingCorrectionInChanged: boolean;
  defaultSort: ReviewSortRuleDefinition[];
  filter?: ReviewFilterDefinition;
}

const DELETED = "已删除";

/**
 * Shared behavior inherited by every human-review module. Individual modules
 * override only the behavior that is genuinely different.
 */
const BASE_REVIEW_BEHAVIOR = {
  tableKind: "standard" as const,
  selectable: true,
  bulkEdit: true,
  editableLineType: true,
  regexCard: false,
  previewKind: "plain" as const,
  detailKind: "none" as const,
  extraColumns: [] as ReviewExtraColumn[],
  typeColumnLabel: "行类型",
  countKind: "rows" as const,
  includeWorkingCorrectionInChanged: true,
  defaultSort: [{ key: "line", direction: "asc" }] as ReviewSortRuleDefinition[],
};

const DERIVED_REVIEW_BEHAVIOR = {
  ...BASE_REVIEW_BEHAVIOR,
  selectable: false,
  bulkEdit: false,
  editableLineType: false,
};

export const REVIEW_MODULE_DEFINITIONS: Record<ModuleName, ReviewModuleDefinition> = {
  "章节定界": {
    ...BASE_REVIEW_BEHAVIOR,
    name: "章节定界",
    toolbarKind: "chapterBoundary",
    lineTypes: ["1 级标题", "新增", "修改", "删除", "已忽略", DELETED],
    extraColumns: ["chapterFile"],
  },
  "章节标题": {
    ...BASE_REVIEW_BEHAVIOR,
    name: "章节标题",
    toolbarKind: "chapterTitle",
    lineTypes: ["1 级标题", "2 级标题", "3 级标题", "4 级标题", "5 级标题", "6 级标题", "非标题", DELETED],
    previewKind: "chapterHeading",
    includeWorkingCorrectionInChanged: false,
    filter: {
      options: ["层级标题行+增删改行", "全部", "层级标题行", "增删改行"],
      defaultValue: "层级标题行+增删改行",
      primaryLineTypes: ["1 级标题", "2 级标题", "3 级标题", "4 级标题", "5 级标题", "6 级标题"],
      primaryOnlyLabel: "层级标题行",
      combinedLabel: "层级标题行+增删改行",
      hideDeletedWorkingRows: true,
    },
  },
  "注释": {
    ...BASE_REVIEW_BEHAVIOR,
    name: "注释",
    toolbarKind: "annotation",
    lineTypes: ["注释引用", "注释正文", "忽略", DELETED],
    regexCard: true,
    detailKind: "annotationPair",
    extraColumns: ["annotationNumber"],
    countKind: "annotationCalibrated",
    defaultSort: [
      { key: "number", direction: "asc" },
      { key: "line", direction: "asc" },
    ],
    filter: {
      options: ["注释及引用+增删改行", "全部", "注释及引用", "增删改行"],
      defaultValue: "注释及引用+增删改行",
      primaryLineTypes: ["注释引用", "注释正文"],
      primaryOnlyLabel: "注释及引用",
      combinedLabel: "注释及引用+增删改行",
    },
  },
  "嵌入块": {
    ...BASE_REVIEW_BEHAVIOR,
    name: "嵌入块",
    toolbarKind: "embed",
    lineTypes: ["嵌入块首", "内嵌标题", "嵌入链接", "嵌入HTML", "HTML表", "嵌入文本", "已忽略", DELETED],
    regexCard: true,
    detailKind: "embedDownload",
    extraColumns: ["embedNumber"],
    defaultSort: [
      { key: "embedNumber", direction: "asc" },
      { key: "line", direction: "asc" },
    ],
    filter: {
      options: ["嵌入相关+增删改行", "全部", "嵌入相关", "增删改行"],
      defaultValue: "嵌入相关+增删改行",
      primaryLineTypes: ["嵌入块首", "内嵌标题", "嵌入链接", "嵌入HTML", "HTML表", "嵌入文本", "已忽略"],
      primaryOnlyLabel: "嵌入相关",
      combinedLabel: "嵌入相关+增删改行",
    },
  },
  "非法断行": {
    ...BASE_REVIEW_BEHAVIOR,
    name: "非法断行",
    toolbarKind: "illegalBreak",
    tableKind: "illegalBreak",
    lineTypes: ["合并", "已忽略"],
  },
  "文本块": {
    ...DERIVED_REVIEW_BEHAVIOR,
    name: "文本块",
    toolbarKind: "textBlocks",
    lineTypes: ["标题", "内嵌", "文本", "注释正文"],
    typeColumnLabel: "文本块类型",
  },
  "分句": {
    ...DERIVED_REVIEW_BEHAVIOR,
    name: "分句",
    toolbarKind: "sentences",
    tableKind: "sentenceDerived",
    lineTypes: ["标题", "文本", "注释正文"],
    typeColumnLabel: "来源类型",
  },
  "翻译": {
    ...DERIVED_REVIEW_BEHAVIOR,
    name: "翻译",
    toolbarKind: "translation",
    tableKind: "translation",
    lineTypes: ["标题", "文本", "注释正文"],
    typeColumnLabel: "来源类型",
  },
};

export const REVIEW_MODULES = Object.keys(REVIEW_MODULE_DEFINITIONS) as ModuleName[];
