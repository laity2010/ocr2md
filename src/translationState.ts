import type { Candidate, TranslationProgressState } from "./types";

export const TRANSLATION_STATE_FILE = ".ocr2md-translations.json";

export interface TranslationEntry {
  sentenceId: string;
  sourceText: string;
  translatedText?: string;
  status: "translated" | "error";
  error?: string;
  updatedAt: string;
}

export interface TranslationStateFile {
  version: 1;
  sourcePath: string;
  entries: Record<string, TranslationEntry>;
}

export function emptyTranslationState(sourcePath: string): TranslationStateFile {
  return { version: 1, sourcePath, entries: {} };
}

export function parseTranslationState(raw: string, sourcePath: string): TranslationStateFile {
  try {
    const parsed = JSON.parse(raw) as Partial<TranslationStateFile>;
    if (parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== "object") {
      return emptyTranslationState(sourcePath);
    }
    const entries: Record<string, TranslationEntry> = {};
    for (const [id, value] of Object.entries(parsed.entries)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Partial<TranslationEntry>;
      if (typeof entry.sentenceId !== "string" || typeof entry.sourceText !== "string") continue;
      if (entry.status !== "translated" && entry.status !== "error") continue;
      entries[id] = {
        sentenceId: entry.sentenceId,
        sourceText: entry.sourceText,
        translatedText: typeof entry.translatedText === "string" ? entry.translatedText : undefined,
        status: entry.status,
        error: typeof entry.error === "string" ? entry.error : undefined,
        updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
      };
    }
    return { version: 1, sourcePath, entries };
  } catch {
    return emptyTranslationState(sourcePath);
  }
}

export function serializeTranslationState(state: TranslationStateFile): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function translationRows(
  sentences: readonly Candidate[],
  state: TranslationStateFile,
): Candidate[] {
  return sentences.map((sentence) => {
    const entry = matchingEntry(sentence, state);
    return {
      ...sentence,
      typeLabel: "翻译",
      translationText: entry?.status === "translated" ? entry.translatedText : undefined,
      translationStatus: entry?.status === "translated" ? "已翻译" : entry?.status === "error" ? "失败" : "待翻译",
      translationError: entry?.status === "error" ? entry.error : undefined,
    };
  });
}

export function translationProgress(
  sentences: readonly Candidate[],
  state: TranslationStateFile,
  phase: TranslationProgressState["phase"] = "idle",
  current?: string,
): TranslationProgressState {
  let completed = 0;
  let failed = 0;
  for (const sentence of sentences) {
    const entry = matchingEntry(sentence, state);
    if (entry?.status === "translated" && entry.translatedText) completed += 1;
    else if (entry?.status === "error") failed += 1;
  }
  return { phase, completed, total: sentences.length, failed, current };
}

export function isTranslationUnitTranslated(unit: Candidate, state: TranslationStateFile): boolean {
  const entry = matchingEntry(unit, state);
  return Boolean(entry?.status === "translated" && entry.translatedText);
}

/** Backward-compatible alias; translation state now also stores composite units. */
export const isSentenceTranslated = isTranslationUnitTranslated;

export function recordTranslation(
  state: TranslationStateFile,
  sentence: Candidate,
  translatedText: string,
  updatedAt = new Date().toISOString(),
): void {
  state.entries[sentence.id] = {
    sentenceId: sentence.id,
    sourceText: sentence.raw,
    translatedText,
    status: "translated",
    updatedAt,
  };
}

export function recordTranslationError(
  state: TranslationStateFile,
  sentence: Candidate,
  error: string,
  updatedAt = new Date().toISOString(),
): void {
  state.entries[sentence.id] = {
    sentenceId: sentence.id,
    sourceText: sentence.raw,
    status: "error",
    error,
    updatedAt,
  };
}

export function translationEntryForUnit(unit: Candidate, state: TranslationStateFile): TranslationEntry | undefined {
  return matchingEntry(unit, state);
}

function matchingEntry(sentence: Candidate, state: TranslationStateFile): TranslationEntry | undefined {
  const entry = state.entries[sentence.id];
  return entry?.sourceText === sentence.raw ? entry : undefined;
}
