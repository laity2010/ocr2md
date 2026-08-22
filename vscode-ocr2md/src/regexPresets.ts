import type { RegexPreset } from "./types";

const OCR_CROSS_LINE_PATTERN = "(?:\\b(?:about|and|or|the|a|an|of|to|in|for|with|by|from)\\b[ \\t]*\\r?\\n(?:[ \\t]*\\r?\\n)?[ \\t]*(?:\\d+|[a-z])|\\b[A-Za-z]{2,}[ \\t]*\\r?\\n(?:[ \\t]*\\r?\\n)?[ \\t]*\\d+[A-Za-z]\\b)";

// 常用正则样式集中维护在这里。
// 要手动增加样式，只需要向 REGEX_PRESETS 追加一项：
// { id: "unique-id", label: "显示名称", pattern: "正则表达式", description: "用途说明" }
// 在 TS/JS 字符串里反斜杠要转义，否则 \d、\. 不会按正则语义保留下来。
export const REGEX_PRESETS: RegexPreset[] = [
  {
    id: "001",
    label: "项目符号 数值",
    pattern: "^\\d+\\. ",
    description: "1. 文本行",
  },
  {
    id: "html-sup",
    label: "HTML 上标",
    pattern: "<sup>.*?</sup>",
    description: "匹配任意 <sup>...</sup> 片段。",
  },
  {
    id: "numeric-sup-footnote",
    label: "数字上标脚注",
    pattern: "<sup>(\\d+)</sup>",
    description: "匹配形如 <sup>1</sup> 的脚注引用。",
  },
  {
    id: "annotation-ref-and-body",
    label: "注释引用 + 正文",
    pattern: "<sup>(\\d+)</sup>\n---\n^\\s*\\d+\\.\\s+.+",
    description: "用分隔行同时扫描 HTML 数字上标引用和数字注释正文。",
  },
  {
    id: "numbered-note-line",
    label: "数字注释行",
    pattern: "^\\s*\\d+\\.\\s+.+",
    description: "匹配 1. Based on ... 这类注释正文行。",
  },
  {
    id: "markdown-footnote-ref",
    label: "Markdown 脚注引用",
    pattern: "\\[\\^([^\\]]+)\\]",
    description: "匹配 [^1] 这类 Markdown 脚注引用。",
  },
  {
    id: "markdown-footnote-body",
    label: "Markdown 脚注正文",
    pattern: "^\\[\\^([^\\]]+)\\]:\\s+.+",
    description: "匹配 [^1]: body 这类 Markdown 脚注定义。",
  },
  {
    id: "star-footnote-ref",
    label: "星号注释引用",
    pattern: "\\[\\*(\\d+)\\]",
    description: "匹配 [*4] 这类星号注释引用。",
  },
  {
    id: "star-footnote-body",
    label: "星号注释正文",
    pattern: "^\\s*\\*(\\d+)\\s+.+$",
    description: "匹配 *4 ... 这类星号注释正文。",
  },
  {
    id: "html-sub",
    label: "HTML 下标",
    pattern: "<sub>.*?</sub>",
    description: "匹配任意 <sub>...</sub> 片段。",
  },
  {
    id: "markdown-heading",
    label: "Markdown 标题",
    pattern: "^#{1,6}\\s+.+",
    description: "匹配 Markdown 标题行。",
  },
  {
    id: "ocr-suspected-illegal-line-break",
    label: "疑似非法断行（英文续行）",
    pattern: "(?=.*[A-Za-z]{20,})[A-Za-z]{2,}$",
    description: "匹配长英文行末的最后一个单词；用于人工确认下一行是否为同一句的续行，再标定到“非法断行”模块。",
  },
  {
    id: "ocr-illegal-line-break-cross-line",
    label: "OCR 非法断行（跨行续句）",
    pattern: OCR_CROSS_LINE_PATTERN,
    description: "匹配英文行末未完结连接词/介词，或空行后以 13F 这类数字字母标识符继续的跨行片段。",
  },
  {
    id: "ocr-suspected-illegal-line-break-cjk",
    label: "疑似非法断行（中文续行）",
    pattern: "(?=.*[\\u4E00-\\u9FFF]{12,})[\\u4E00-\\u9FFF]{2,}$",
    description: "匹配较长中文行末连续的汉字，避开以 。！？；： 等标点结束的完整句；用于人工确认下一行是否为续行。",
  },
  {
    id: "ocr-hyphenated-line-break",
    label: "OCR 断词连字符",
    pattern: "[A-Za-z]{2,}-$",
    description: "匹配行末以连字符截断的英文词，例如 invest-；常见于 OCR 断词。",
  },
  {
    id: "markdown-image",
    label: "Markdown 图片",
    pattern: "!\\[[^\\]]*\\]\\([^)]*\\)",
    description: "匹配 Markdown 图片语法。",
  },
  {
    id: "markdown-external-image",
    label: "Markdown 外部图片",
    pattern: "!\\[[^\\]]*\\]\\(https?://[^\\s)]+\\)",
    description: "匹配 ![image](https://...) 这类外部图片资源链接。",
  },
  {
    id: "url",
    label: "URL",
    pattern: "https?://[^\\s)]+",
    description: "匹配 http/https 链接。",
  },
];

/** Defaults and demonstrations used by each regular-expression data-table module. */
export const MODULE_REGEX_PRESETS: Record<string, RegexPreset[]> = {
  "未分类": REGEX_PRESETS,
  "注释": REGEX_PRESETS.filter((preset) => ["html-sup", "numeric-sup-footnote", "annotation-ref-and-body", "numbered-note-line", "markdown-footnote-ref", "markdown-footnote-body", "star-footnote-ref", "star-footnote-body"].includes(preset.id)),
  "标题": REGEX_PRESETS.filter((preset) => preset.id === "markdown-heading"),
  "图片": REGEX_PRESETS.filter((preset) => ["markdown-image", "markdown-external-image", "url"].includes(preset.id)),
  "非法断行": REGEX_PRESETS.filter((preset) => preset.id.startsWith("ocr-")),
};

export const MODULE_REGEX_DEFAULTS: Record<string, string> = {
  "未分类": "^\\d+\\.\\s+.+",
  "注释": "<sup>(\\d+)</sup>\n---\n^\\s*\\d+\\.\\s+.+\n---\n\\[\\*(\\d+)\\]\n---\n^\\s*\\*(\\d+)\\s+.+$",
  "标题": "^#{1,6}\\s+.+",
  "图片": "!\\[[^\\]]*\\]\\(https?://[^\\s)]+\\)",
  "非法断行": OCR_CROSS_LINE_PATTERN,
};
