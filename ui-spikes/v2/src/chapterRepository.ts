import type { AnnotationPair, Candidate } from "../../../src/types";
import type {
  TranslationServiceId,
} from "../../../src/types";
import type {
  TranslationStateFile,
} from "../../../src/translationState";

export interface ChapterListItem {
  id: string;
  name: string;
  ready: boolean;
  reason?: string;
  workingFile?: string;
  sidecarFile?: string;
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
  translationSourceChapterId?: string;
  translationServiceId?: TranslationServiceId;
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

export interface TranslationStateSaveInput {
  chapter: ChapterWorkspaceData;
  translationState: TranslationStateFile;
}

export interface ChapterRepository {
  listChapters(): Promise<ChapterCatalog>;
  loadChapter(chapterId: string): Promise<ChapterWorkspaceData>;
  saveChapter(input: ChapterSaveInput): Promise<ChapterSaveResult>;
  exportBoundary?(input: ChapterSaveInput): Promise<BoundaryExportResult>;
  exportTransSource?(input: TransSourceExportInput): Promise<ChapterWorkspaceData>;
  loadTranslation?(chapterId: string): Promise<ChapterWorkspaceData>;
  saveTranslationState?(
    input: TranslationStateSaveInput,
  ): Promise<ChapterWorkspaceData>;
}
