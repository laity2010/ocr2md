export type ModuleName = "章节定界" | "章节标题" | "注释" | "嵌入块" | "文本块" | "分句";

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

export type TranslationServiceId = "deepl";

export interface TranslationTestState {
  phase: "idle" | "testing" | "success" | "error";
  message: string;
  statusCode?: number;
  translatedText?: string;
  rawResponse?: string;
}

export interface TranslationSettingsState {
  service: TranslationServiceId;
  apiKeyConfigured: boolean;
  sampleText: string;
  test: TranslationTestState;
}

export interface SidebarState {
  workspaceLabel: string;
  selectedFile?: FileEntry;
  files: FileEntry[];
  activeModule: ModuleName;
  rows: Candidate[];
  annotationPairs: AnnotationPair[];
  moduleRegexPatterns: Record<string, string>;
  moduleRegexPresets: Record<string, RegexPreset[]>;
  viewMode?: "table" | "translationService";
  translationSettings?: TranslationSettingsState;
  imageDownloadProgress?: ImageDownloadProgress;
  annotationMatchSummary?: {
    calibrated: number;
    paired: number;
    missingRef: number;
    missingBody: number;
    missingNumber: number;
  };
}
