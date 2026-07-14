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
  searchMatches: Candidate[];
  regexPresets: RegexPreset[];
  refs: Candidate[];
  bodies: Candidate[];
  suspicious: Candidate[];
  pairs: FootnotePair[];
}
