import { createHash } from "crypto";
import { scanTranslationUnits } from "./translationUnits";
import type { Candidate, SourceRange } from "./types";

export const SENTENCE_SOURCE_FILE_VERSION = 1;
export const SENTENCE_TRANSLATION_FILE_VERSION = 1;

export interface SentenceSourceEntry {
  id: string;
  sourceText: string;
  translationText: string;
  protection: Array<{ token: string; value: string }>;
  lineType?: string;
  range: SourceRange;
  sourceFingerprint?: string;
  contextFingerprint?: string;
  sourceOccurrenceCount?: number;
}

export interface SentenceSourceFile {
  version: 1;
  sourcePath: string;
  sourceHash: string;
  entries: SentenceSourceEntry[];
}

export interface SentenceTranslationEntry {
  sentenceId: string;
  sourceFingerprint?: string;
  contextFingerprint?: string;
  translatedText?: string;
  status: "translated" | "error" | "pending";
  error?: string;
  updatedAt?: string;
  model?: string;
}

export interface SentenceTranslationFile {
  version: 1;
  provider: string;
  label?: string;
  sourceFile: "original.json";
  entries: Record<string, SentenceTranslationEntry>;
}

export function buildSentenceSourceFile(
  markdown: string,
  sourcePath: string,
): SentenceSourceFile {
  const entries = scanTranslationUnits(markdown, sourcePath)
    .filter((unit) => unit.translationUnitKind === "sentence")
    .map((unit): SentenceSourceEntry => ({
      id: unit.id,
      sourceText: unit.raw,
      translationText: unit.translationText ?? unit.raw,
      protection: unit.translationProtection?.map((item) => ({ ...item })) ?? [],
      lineType: unit.lineType,
      range: { ...unit.range },
      sourceFingerprint: unit.translationSourceFingerprint,
      contextFingerprint: unit.translationContextFingerprint,
      sourceOccurrenceCount: unit.translationSourceOccurrenceCount,
    }));
  return {
    version: SENTENCE_SOURCE_FILE_VERSION,
    sourcePath,
    sourceHash: createHash("sha256")
      .update(markdown)
      .digest("hex"),
    entries,
  };
}

export function parseSentenceSourceFile(
  value: unknown,
): SentenceSourceFile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const file = value as Partial<SentenceSourceFile>;
  if (
    file.version !== SENTENCE_SOURCE_FILE_VERSION
    || typeof file.sourcePath !== "string"
    || typeof file.sourceHash !== "string"
    || !Array.isArray(file.entries)
  ) return undefined;
  const entries = file.entries.filter(isSentenceSourceEntry).map((entry) => ({
    ...entry,
    range: { ...entry.range },
    protection: entry.protection.map((item) => ({ ...item })),
  }));
  return { version: 1, sourcePath: file.sourcePath, sourceHash: file.sourceHash, entries };
}

export function parseSentenceTranslationFile(
  value: unknown,
  fallbackProvider?: string,
): SentenceTranslationFile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const file = value as Partial<SentenceTranslationFile>;
  const provider = typeof file.provider === "string" && file.provider.trim()
    ? file.provider.trim()
    : fallbackProvider?.trim();
  if (
    file.version !== SENTENCE_TRANSLATION_FILE_VERSION
    || !provider
    || file.sourceFile !== "original.json"
    || !file.entries
    || typeof file.entries !== "object"
    || Array.isArray(file.entries)
  ) return undefined;
  const entries: Record<string, SentenceTranslationEntry> = {};
  for (const [key, raw] of Object.entries(file.entries)) {
    const entry = parseTranslationEntry(raw, key);
    if (entry) entries[key] = entry;
  }
  return {
    version: 1,
    provider,
    label: typeof file.label === "string" && file.label.trim() ? file.label.trim() : undefined,
    sourceFile: "original.json",
    entries,
  };
}

export function sentenceCandidatesFromFiles(
  source: SentenceSourceFile,
  translations: readonly SentenceTranslationFile[],
): Candidate[] {
  const matchers = translations.map((file) => ({
    file,
    bySource: translationEntriesBySourceFingerprint(file),
  }));
  return source.entries.map((entry) => {
    const translationResults: NonNullable<Candidate["translationResults"]> = {};
    for (const matcher of matchers) {
      const result = matchingTranslation(entry, matcher.file, matcher.bySource);
      translationResults[matcher.file.provider] = {
        translatedText: result?.status === "translated" ? result.translatedText : undefined,
        status: result?.status === "translated"
          ? "已翻译"
          : result?.status === "error"
            ? "失败"
            : "待翻译",
        error: result?.status === "error" ? result.error : undefined,
        model: result?.model,
      };
    }
    return {
      id: entry.id,
      rowId: entry.id,
      kind: "regex",
      label: normalizePreview(entry.sourceText),
      raw: entry.sourceText,
      preview: normalizePreview(entry.sourceText),
      translationText: entry.translationText,
      translationProtection: entry.protection.map((item) => ({ ...item })),
      translationResults,
      range: { ...entry.range },
      typeLabel: "分句",
      lineType: entry.lineType,
      translationUnitKind: "sentence",
      translationSourceFingerprint: entry.sourceFingerprint,
      translationContextFingerprint: entry.contextFingerprint,
      translationSourceOccurrenceCount: entry.sourceOccurrenceCount,
      sourcePath: source.sourcePath,
      status: "候选",
    };
  });
}

export function sentenceProviderLabel(provider: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const normalized = provider.trim().toLowerCase();
  if (normalized === "deepl") return "DeepL";
  if (normalized === "chatgpt" || normalized === "openai") return "ChatGPT";
  return provider.trim() || "译文";
}

function isSentenceSourceEntry(value: unknown): value is SentenceSourceEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<SentenceSourceEntry>;
  return typeof entry.id === "string"
    && typeof entry.sourceText === "string"
    && typeof entry.translationText === "string"
    && Array.isArray(entry.protection)
    && Boolean(entry.range)
    && typeof entry.range?.line === "number"
    && typeof entry.range?.start === "number"
    && typeof entry.range?.end === "number";
}

function parseTranslationEntry(
  value: unknown,
  fallbackId: string,
): SentenceTranslationEntry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<SentenceTranslationEntry>;
  const status = item.status === "translated" || item.status === "error" || item.status === "pending"
    ? item.status
    : undefined;
  if (!status) return undefined;
  return {
    sentenceId: typeof item.sentenceId === "string" ? item.sentenceId : fallbackId,
    sourceFingerprint: typeof item.sourceFingerprint === "string" ? item.sourceFingerprint : undefined,
    contextFingerprint: typeof item.contextFingerprint === "string" ? item.contextFingerprint : undefined,
    translatedText: typeof item.translatedText === "string" ? item.translatedText : undefined,
    status,
    error: typeof item.error === "string" ? item.error : undefined,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
    model: typeof item.model === "string" ? item.model : undefined,
  };
}

function translationEntriesBySourceFingerprint(
  file: SentenceTranslationFile,
): Map<string, SentenceTranslationEntry[]> {
  const map = new Map<string, SentenceTranslationEntry[]>();
  for (const entry of Object.values(file.entries)) {
    if (!entry.sourceFingerprint) continue;
    const list = map.get(entry.sourceFingerprint) ?? [];
    list.push(entry);
    map.set(entry.sourceFingerprint, list);
  }
  return map;
}

function matchingTranslation(
  source: SentenceSourceEntry,
  file: SentenceTranslationFile,
  bySource: Map<string, SentenceTranslationEntry[]>,
): SentenceTranslationEntry | undefined {
  const exact = file.entries[source.id];
  if (exact) return exact;
  if (!source.sourceFingerprint) return undefined;
  const matches = bySource.get(source.sourceFingerprint) ?? [];
  if (matches.length === 1) return matches[0];
  if (source.contextFingerprint) {
    return matches.find((entry) => entry.contextFingerprint === source.contextFingerprint);
  }
  return undefined;
}

function normalizePreview(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
