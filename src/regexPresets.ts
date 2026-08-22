import type { RegexPreset } from "./types";

export const ANNOTATION_REGEX_PRESETS: RegexPreset[] = [
  {
    id: "annotation-ref-and-body",
    label: "注释引用 + 正文",
    pattern: "<sup>(\\d+)</sup>\n---\n^\\s*\\d+\\.\\s+.+\n---\n\\[\\*(\\d+)\\]\n---\n^\\s*\\*(\\d+)\\s+.+$",
    description: "同时扫描 HTML 数字上标、数字注释正文和星号注释。",
  },
  {
    id: "markdown-footnotes",
    label: "Markdown 脚注",
    pattern: "\\[\\^([^\\]]+)\\](?!:)\n---\n^\\[\\^([^\\]]+)\\]:\\s+.+",
    description: "扫描 Markdown 脚注引用与正文。",
  },
];

export const IMAGE_REGEX_PRESETS: RegexPreset[] = [
  {
    id: "markdown-external-image",
    label: "Markdown 外部图片",
    pattern: "!\\[[^\\]]*\\]\\(https?://[^\\s)]+\\)",
    description: "扫描 Markdown 中的外部图片链接。",
  },
  {
    id: "markdown-image",
    label: "Markdown 图片",
    pattern: "!\\[[^\\]]*\\]\\([^)]*\\)",
    description: "扫描所有 Markdown 图片语法。",
  },
];

export const REGEX_PRESETS: RegexPreset[] = [
  ...ANNOTATION_REGEX_PRESETS,
  ...IMAGE_REGEX_PRESETS,
];

export const MODULE_REGEX_PRESETS: Record<string, RegexPreset[]> = {
  "注释": ANNOTATION_REGEX_PRESETS,
  "图片": IMAGE_REGEX_PRESETS,
};

export const MODULE_REGEX_DEFAULTS: Record<string, string> = {
  "注释": ANNOTATION_REGEX_PRESETS.map((preset) => preset.pattern).join("\n---\n"),
  "图片": IMAGE_REGEX_PRESETS[0].pattern,
};
