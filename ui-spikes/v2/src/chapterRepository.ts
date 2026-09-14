import type { AnnotationPair, Candidate } from "../../../src/types";
import type {
  TranslationServiceId,
} from "../../../src/types";
import type {
  TranslationStateFile,
} from "../../../src/translationState";
import type {
  SentenceSourceFile,
  SentenceTranslationFile,
} from "../../../src/sentenceFiles";

export interface ChapterListItem {
  id: string;
  name: string;
  ready: boolean;
  reason?: string;
  workingFile?: string;
  sidecarFile?: string;
  transReady?: boolean;
}

export interface ChapterCatalog {
  projectName: string;
  chapters: ChapterListItem[];
  boundary?: {
    ready: boolean;
    sourceFileCount: number;
    reason?: string;
  };
}

export interface ChapterWorkspaceData {
  id: string;
  kind?: "chapter" | "boundary" | "translation";
  path: string;
  name: string;
  originalText: string;
  workingText: string;
  rows: Candidate[];
  annotationPairs: AnnotationPair[];
  sidecarSourceFile?: string;
  revision?: string;
  boundarySourceFiles?: string[];
  translationState?: TranslationStateFile;
  sentenceSource?: SentenceSourceFile;
  sentenceTranslations?: SentenceTranslationFile[];
  translationSourceChapterId?: string;
  translationServiceId?: TranslationServiceId;
  media?: ChapterMediaItem[];
}

export interface ChapterMediaItem {
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  mimeType: string;
}

export interface ChapterSaveInput {
  chapter: ChapterWorkspaceData;
  workingText: string;
}

export interface ChapterSaveResult {
  revision: string;
  savedAt: string;
  workingText: string;
}

export interface ChapterImagePasteInput {
  chapterId: string;
  mimeType: string;
  dataBase64: string;
}

export interface ChapterImagePasteResult {
  relativePath: string;
  fileName: string;
}

export interface ChapterMediaDownloadInput {
  chapterId: string;
  expectedRevision: string;
  sourceUrl: string;
}

export interface ChapterMediaDownloadResult extends ChapterSaveResult {
  relativePath: string;
  fileName: string;
  media: ChapterMediaItem[];
}

export interface BoundaryExportResult extends ChapterSaveResult {
  exported: Array<{
    chapterFile: string;
    originalPath: string;
    workingPath: string;
    sidecarPath: string;
  }>;
}

export interface TransSourceExportInput {
  chapterId: string;
  expectedRevision?: string;
  markdown: string;
}

export type CalibrationExportDestination = "trans" | "output";

export interface CalibrationExportInput {
  chapterId: string;
  expectedRevision?: string;
  destination: CalibrationExportDestination;
  markdown: string;
}

export interface CalibrationExportResult {
  savedAt: string;
  destination: CalibrationExportDestination;
  relativePath: string;
  fileName: string;
}

export interface TranslationStateSaveInput {
  chapter: ChapterWorkspaceData;
  translationState: TranslationStateFile;
}

export interface ChapterRepository {
  listChapters(): Promise<ChapterCatalog>;
  loadChapter(chapterId: string): Promise<ChapterWorkspaceData>;
  saveChapter(input: ChapterSaveInput): Promise<ChapterSaveResult>;
  savePastedImage?(
    input: ChapterImagePasteInput,
  ): Promise<ChapterImagePasteResult>;
  downloadExternalMedia?(
    input: ChapterMediaDownloadInput,
  ): Promise<ChapterMediaDownloadResult>;
  exportBoundary?(input: ChapterSaveInput): Promise<BoundaryExportResult>;
  exportCalibration?(
    input: CalibrationExportInput,
  ): Promise<CalibrationExportResult>;
  exportTransSource?(input: TransSourceExportInput): Promise<ChapterWorkspaceData>;
  loadTranslation?(chapterId: string): Promise<ChapterWorkspaceData>;
  saveTranslationState?(
    input: TranslationStateSaveInput,
  ): Promise<ChapterWorkspaceData>;
}
