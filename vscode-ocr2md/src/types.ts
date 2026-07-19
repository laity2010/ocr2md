export type CandidateKind = "regex" | "ref" | "body" | "suspicious";

export type PairStatus = "待确认" | "已确认" | "异常" | "缺少 ref" | "缺少 body";

export interface SourceRange {
  line: number;
  start: number;
  /** Present when a regex match spans more than one source line. */
  endLine?: number;
  end: number;
}

export interface TranslationProtectedToken {
  placeholder: string;
  original: string;
  kind: "footnote" | "latex";
}

export interface Candidate {
  id: string;
  kind: CandidateKind;
  label: string;
  raw: string;
  preview: string;
  /** The individual regex that produced this candidate, when applicable. */
  regexSource?: string;
  /** Numeric footnote identifier extracted from a ref or body candidate. */
  annotationNumber?: string;
  /** Candidate was manually added to the editable correction working copy. */
  isWorkingCorrection?: boolean;
  /** Editable working-copy file used for reveal/navigation of a correction. */
  workingCopyPath?: string;
  /** Logical line in the original source when range points into a working copy. */
  sourceLine?: number;
  range: SourceRange;
  typeLabel?: string;
  lineType?: string;
  /** Original text-block index. Composite segments from one block share it. */
  blockIndex?: number;
  /** One-based sentence index within its original text block. */
  sentenceIndex?: number;
  /** Source text-block candidate ID for sentence candidates. */
  parentBlockId?: string;
  chapterFile?: string;
  localPath?: string;
  suggestions?: string[];
  replacement?: string;
  translationText?: string;
  translation?: string;
  restoredTranslation?: string;
  protectedTokens?: TranslationProtectedToken[];
  /** Source information is populated for directory-scoped regex results. */
  sourcePath?: string;
  sourceLabel?: string;
  reason?: string;
  status?: "候选" | "已拒绝" | "异常";
}

export interface FootnotePair {
  id: string;
  label: string;
  ref?: Candidate;
  body?: Candidate;
  normalizedRef: string;
  normalizedBody: string;
  status: PairStatus;
}

export type AnnotationPairStatus = "自动匹配" | "已确认" | "异常" | "待补引用" | "待补正文";
export type AnnotationPairConfidence = "high" | "medium" | "low";

/** Persistent pairing decision for annotation candidates in the data table. */
export interface AnnotationPair {
  id: string;
  /** Human-readable ID: source-file order plus the pair anchor line. */
  pairId: string;
  sourcePath: string;
  number: string;
  refCandidateId?: string;
  bodyCandidateId?: string;
  status: AnnotationPairStatus;
  confidence: AnnotationPairConfidence;
  bodyOrigin: "原文" | "工作稿人工补充";
}

export interface ScanResult {
  refs: Candidate[];
  bodies: Candidate[];
  suspicious: Candidate[];
  pairs: FootnotePair[];
}

export interface FileEntry {
  label: string;
  path: string;
}

export interface RegexPreset {
  id: string;
  label: string;
  pattern: string;
  description: string;
}

export interface SidebarState {
  workspaceLabel: string;
  selectedFile?: FileEntry;
  previewEditable: boolean;
  files: FileEntry[];
  searchPattern: string;
  regexScopeDirectory: string;
  regexIncludeSubdirectories: boolean;
  searchMatches: Candidate[];
  searchTableRows: Candidate[];
  sentenceRows: Candidate[];
  moduleRegexPatterns: Record<string, string>;
  moduleRegexPresets: Record<string, RegexPreset[]>;
  selectedCandidate?: Candidate;
  selectedPairId?: string;
  postOcrCleanMode: boolean;
  imageDownloadProgress?: { phase: "downloading" | "complete"; completed: number; total: number; current?: string; failed?: number; lastError?: string };
  deeplConfigured: boolean;
  translationTestResult?: { success: boolean; message: string };
  translationProgress?: { phase: "translating" | "complete"; completed: number; total: number; current?: string; failed?: number; lastError?: string };
  failedTranslationBlockIndexes: number[];
  regexPresets: RegexPreset[];
  refs: Candidate[];
  bodies: Candidate[];
  suspicious: Candidate[];
  pairs: FootnotePair[];
  annotationPairs: AnnotationPair[];
}
