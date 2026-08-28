export type ModuleName = "章节定界" | "章节标题" | "注释" | "嵌入块" | "非法断行" | "文本块" | "分句" | "翻译";

export interface SourceRange {
  line: number;
  start: number;
  endLine?: number;
  end: number;
}

export interface Candidate {
  id: string;
  rowId?: string;
  atomId?: string;
  anchorTextHash?: string;
  anchorPreviousHash?: string;
  anchorNextHash?: string;
  kind: "regex" | "ref" | "body";
  label: string;
  raw: string;
  preview: string;
  regexSource?: string;
  annotationNumber?: string;
  annotationNumberSource?: "extracted" | "manual";
  isWorkingCorrection?: boolean;
  workingCopyPath?: string;
  sourceLine?: number;
  range: SourceRange;
  /** Sidecar calibration loaded before rescan; line numbers are not identity. */
  rangeUntrusted?: boolean;
  typeLabel?: ModuleName;
  lineType?: string;
  chapterFile?: string;
  chapterBoundaryState?: "heading" | "added" | "modified" | "deleted";
  baselinePreview?: string;
  localPath?: string;
  imageDownloadStatus?: "pending" | "done" | "failed";
  imageDownloadError?: string;
  embedNumber?: number;
  parentBlockId?: string;
  parentBlockIndex?: number;
  sentenceIndex?: number;
  translationUnitKind?: "sentence" | "composite";
  /** Stable identity derived from normalized translatable source content, independent of block/line position. */
  translationSourceFingerprint?: string;
  /** Neighbor-aware fingerprint used only to disambiguate repeated identical source units. */
  translationContextFingerprint?: string;
  /** Number of current translation units sharing the same source fingerprint. */
  translationSourceOccurrenceCount?: number;
  translationText?: string;
  translationStatus?: "待翻译" | "已翻译" | "失败";
  translationError?: string;
  /** Per-service translation results shown side-by-side in the translation table. */
  translationResults?: Record<string, {
    translatedText?: string;
    status: "待翻译" | "已翻译" | "失败";
    error?: string;
    model?: string;
  }>;
  previousLineText?: string;
  nextLineText?: string;
  mergedPreview?: string;
  breakReason?: string;
  breakConfidence?: "高" | "中";
  sourcePath?: string;
  sourceLabel?: string;
  status?: "候选" | "异常";
}

export type AnnotationPairStatus = "自动匹配" | "已确认" | "待补引用" | "待补正文";

export interface AnnotationPair {
  id: string;
  pairId: string;
  sourcePath: string;
  number: string;
  refCandidateId?: string;
  bodyCandidateId?: string;
  status: AnnotationPairStatus;
}

export interface FileEntry {
  label: string;
  path: string;
  kind: "ocr" | "chapter" | "working" | "trans";
  changed?: boolean;
}

export interface RegexPreset {
  id: string;
  label: string;
  pattern: string;
  description: string;
}

export interface ImageDownloadProgress {
  phase: "downloading" | "complete";
  completed: number;
  total: number;
  downloaded?: number;
  skipped?: number;
  current?: string;
  failed?: number;
  lastError?: string;
}

export type TranslationServiceId = "deepl" | "openai";

export interface TranslationTestState {
  phase: "idle" | "testing" | "success" | "error";
  message: string;
  statusCode?: number;
  translatedText?: string;
  rawResponse?: string;
}

export interface TranslationServiceSettingsItem {
  id: TranslationServiceId;
  label: string;
  apiKeyConfigured: boolean;
  model?: string;
  prompt?: string;
}

export interface TranslationSettingsState {
  /** Service used by the next Start/Continue Translation action. */
  service: TranslationServiceId;
  /** Default service shown in the cross-translation export selector. */
  exportService: TranslationServiceId;
  services: TranslationServiceSettingsItem[];
  sampleText: string;
  test: TranslationTestState;
}

export interface TranslationProgressState {
  phase: "idle" | "running" | "complete";
  serviceId?: TranslationServiceId;
  completed: number;
  total: number;
  failed: number;
  current?: string;
}

export interface SidebarState {
  workspaceLabel: string;
  selectedFile?: FileEntry;
  files: FileEntry[];
  activeModule: ModuleName;
  headingNumberingEnabled: boolean;
  rows: Candidate[];
  annotationPairs: AnnotationPair[];
  moduleRegexPatterns: Record<string, string>;
  moduleRegexPresets: Record<string, RegexPreset[]>;
  viewMode?: "table" | "translationService";
  translationSettings?: TranslationSettingsState;
  translationProgress?: TranslationProgressState;
  imageDownloadProgress?: ImageDownloadProgress;
  annotationMatchSummary?: {
    calibrated: number;
    paired: number;
    missingRef: number;
    missingBody: number;
    missingNumber: number;
  };
}
