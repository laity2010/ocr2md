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

export const EMBED_REGEX_PRESETS: RegexPreset[] = [
  {
    id: "markdown-image",
    label: "Markdown 图片链接",
    pattern: "!\\[[^\\]]*\\]\\([^)]*\\)",
    description: "扫描 Markdown 图片链接。",
  },
  {
    id: "wiki-image",
    label: "Wiki 图片链接",
    pattern: "!\\[\\[[^\\]]+\\]\\]",
    description: "扫描 ![[image]] 图片链接。",
  },
  {
    id: "html-embed",
    label: "HTML 代码",
    pattern: "<(?:img|figure|iframe|table|video|audio|object|picture|svg)\\b[^>]*>",
    description: "扫描常见嵌入 HTML 开标签。表格等内容由嵌入块扫描器整块识别。",
  },
];

export const REGEX_PRESETS: RegexPreset[] = [
  ...ANNOTATION_REGEX_PRESETS,
  ...EMBED_REGEX_PRESETS,
];

export const MODULE_REGEX_PRESETS: Record<string, RegexPreset[]> = {
  "注释": ANNOTATION_REGEX_PRESETS,
  "嵌入块": EMBED_REGEX_PRESETS,
};

export const MODULE_REGEX_DEFAULTS: Record<string, string> = {
  "注释": ANNOTATION_REGEX_PRESETS.map((preset) => preset.pattern).join("\n---\n"),
  "嵌入块": EMBED_REGEX_PRESETS
    .filter((preset) => preset.id !== "html-embed")
    .map((preset) => preset.pattern)
    .join("\n---\n"),
};
