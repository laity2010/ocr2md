import type { Candidate, TranslationProgressState, TranslationServiceId } from "./types";
import { translationContextFingerprint, translationSourceFingerprint } from "./translationUnits";

export const TRANSLATION_STATE_FILE = ".ocr2md-translations.json";
export const TRANSLATION_STATE_VERSION = 2;

export interface TranslationResultEntry {
  translatedText?: string;
  status: "translated" | "error";
  error?: string;
  updatedAt: string;
  /** Optional provider model/config snapshot, e.g. gpt-5.4. */
  model?: string;
}

export interface TranslationEntry {
  sentenceId: string;
  sourceText: string;
  /** Stable content identity; older state files may omit it and are fingerprinted lazily. */
  sourceFingerprint?: string;
  /** Neighbor-aware identity for disambiguating repeated identical sentences. */
  contextFingerprint?: string;
  /** Independent translation result for each provider/config. */
  translations: Record<string, TranslationResultEntry>;
}

export interface TranslationStateFile {
  version: 2;
  sourcePath: string;
  entries: Record<string, TranslationEntry>;
}

interface LegacyTranslationEntry {
  sentenceId?: unknown;
  sourceText?: unknown;
  sourceFingerprint?: unknown;
  contextFingerprint?: unknown;
  translatedText?: unknown;
  status?: unknown;
  error?: unknown;
  updatedAt?: unknown;
}

export function emptyTranslationState(sourcePath: string): TranslationStateFile {
  return { version: TRANSLATION_STATE_VERSION, sourcePath, entries: {} };
}

export function parseTranslationState(raw: string, sourcePath: string): TranslationStateFile {
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; entries?: unknown };
    if (!parsed.entries || typeof parsed.entries !== "object") return emptyTranslationState(sourcePath);
    const entries: Record<string, TranslationEntry> = {};
    for (const [id, value] of Object.entries(parsed.entries as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const legacy = value as LegacyTranslationEntry & { translations?: unknown };
      if (typeof legacy.sentenceId !== "string" || typeof legacy.sourceText !== "string") continue;
      const base: TranslationEntry = {
        sentenceId: legacy.sentenceId,
        sourceText: legacy.sourceText,
        sourceFingerprint: typeof legacy.sourceFingerprint === "string" ? legacy.sourceFingerprint : undefined,
        contextFingerprint: typeof legacy.contextFingerprint === "string" ? legacy.contextFingerprint : undefined,
        translations: {},
      };
      if (parsed.version === TRANSLATION_STATE_VERSION && legacy.translations && typeof legacy.translations === "object") {
        for (const [serviceId, resultValue] of Object.entries(legacy.translations as Record<string, unknown>)) {
          const result = parseResult(resultValue);
          if (result) base.translations[serviceId] = result;
        }
      } else {
        // v1 had exactly one provider and that provider was DeepL.
        const result = parseResult(legacy);
        if (result) base.translations.deepl = result;
      }
      entries[id] = base;
    }
    return { version: TRANSLATION_STATE_VERSION, sourcePath, entries };
  } catch {
    return emptyTranslationState(sourcePath);
  }
}

function parseResult(value: unknown): TranslationResultEntry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as { translatedText?: unknown; status?: unknown; error?: unknown; updatedAt?: unknown; model?: unknown };
  if (item.status !== "translated" && item.status !== "error") return undefined;
  return {
    translatedText: typeof item.translatedText === "string" ? item.translatedText : undefined,
    status: item.status,
    error: typeof item.error === "string" ? item.error : undefined,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
    model: typeof item.model === "string" ? item.model : undefined,
  };
}

export function serializeTranslationState(state: TranslationStateFile): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function translationRows(
  units: readonly Candidate[],
  state: TranslationStateFile,
  activeService: TranslationServiceId = "deepl",
  serviceIds: readonly TranslationServiceId[] = ["deepl", "openai"],
): Candidate[] {
  return units.map((unit) => {
    const results: NonNullable<Candidate["translationResults"]> = {};
    for (const serviceId of serviceIds) {
      const result = translationResultForUnit(unit, state, serviceId);
      results[serviceId] = {
        translatedText: result?.status === "translated" ? result.translatedText : undefined,
        status: result?.status === "translated" ? "已翻译" : result?.status === "error" ? "失败" : "待翻译",
        error: result?.status === "error" ? result.error : undefined,
        model: result?.model,
      };
    }
    const active = results[activeService];
    return {
      ...unit,
      typeLabel: "翻译",
      translationResults: results,
      translationText: active?.translatedText,
      translationStatus: active?.status ?? "待翻译",
      translationError: active?.error,
    };
  });
}

export function translationProgress(
  units: readonly Candidate[],
  state: TranslationStateFile,
  phase: TranslationProgressState["phase"] = "idle",
  current?: string,
  serviceId: TranslationServiceId = "deepl",
): TranslationProgressState {
  let completed = 0;
  let failed = 0;
  for (const unit of units) {
    const result = translationResultForUnit(unit, state, serviceId);
    if (result?.status === "translated" && result.translatedText) completed += 1;
    else if (result?.status === "error") failed += 1;
  }
  return { phase, completed, total: units.length, failed, current, serviceId };
}

export function isTranslationUnitTranslated(
  unit: Candidate,
  state: TranslationStateFile,
  serviceId: TranslationServiceId = "deepl",
): boolean {
  const result = translationResultForUnit(unit, state, serviceId);
  return Boolean(result?.status === "translated" && result.translatedText);
}

/** Backward-compatible alias. */
export const isSentenceTranslated = isTranslationUnitTranslated;

export function recordTranslation(
  state: TranslationStateFile,
  unit: Candidate,
  translatedText: string,
  updatedAt = new Date().toISOString(),
  serviceId: TranslationServiceId = "deepl",
  model?: string,
): void {
  const entry = ensureEntry(unit, state);
  entry.translations[serviceId] = {
    translatedText,
    status: "translated",
    updatedAt,
    model,
  };
}

export function recordTranslationError(
  state: TranslationStateFile,
  unit: Candidate,
  error: string,
  updatedAt = new Date().toISOString(),
  serviceId: TranslationServiceId = "deepl",
  model?: string,
): void {
  const entry = ensureEntry(unit, state);
  entry.translations[serviceId] = {
    status: "error",
    error,
    updatedAt,
    model,
  };
}

export function translationEntryForUnit(unit: Candidate, state: TranslationStateFile): TranslationEntry | undefined {
  return matchingEntry(unit, state);
}

export function translationResultForUnit(
  unit: Candidate,
  state: TranslationStateFile,
  serviceId: TranslationServiceId = "deepl",
): TranslationResultEntry | undefined {
  return matchingEntry(unit, state)?.translations[serviceId];
}

/** Add stable fingerprint metadata to legacy entries that can be reused safely. */
export function backfillTranslationFingerprints(units: readonly Candidate[], state: TranslationStateFile): number {
  let changed = backfillLegacyOrderedContexts(units, state);
  for (const unit of units) {
    const entry = matchingEntry(unit, state);
    if (!entry) continue;
    const sourceFingerprint = unitSourceFingerprint(unit);
    if (entry.sourceFingerprint !== sourceFingerprint) {
      entry.sourceFingerprint = sourceFingerprint;
      changed += 1;
    }
    const exactCurrentId = state.entries[unit.id] === entry;
    const sourceIsUniqueNow = (unit.translationSourceOccurrenceCount ?? 1) <= 1;
    if (unit.translationContextFingerprint && !entry.contextFingerprint && (exactCurrentId || sourceIsUniqueNow)) {
      entry.contextFingerprint = unit.translationContextFingerprint;
      changed += 1;
    }
  }
  return changed;
}

function ensureEntry(unit: Candidate, state: TranslationStateFile): TranslationEntry {
  const exact = state.entries[unit.id];
  const sourceFingerprint = unitSourceFingerprint(unit);
  const hasStableIdentityMetadata = Boolean(
    unit.translationSourceFingerprint
    || unit.translationContextFingerprint
    || unit.translationSourceOccurrenceCount !== undefined
  );
  const existing = exact && entrySourceFingerprint(exact) === sourceFingerprint
    ? exact
    : hasStableIdentityMetadata ? matchingEntry(unit, state) : undefined;
  if (existing) {
    existing.sentenceId = unit.id;
    existing.sourceText = unit.raw;
    existing.sourceFingerprint = unitSourceFingerprint(unit);
    existing.contextFingerprint = unit.translationContextFingerprint ?? existing.contextFingerprint;
    return existing;
  }
  const entry: TranslationEntry = {
    sentenceId: unit.id,
    sourceText: unit.raw,
    sourceFingerprint: unitSourceFingerprint(unit),
    contextFingerprint: unit.translationContextFingerprint,
    translations: {},
  };
  state.entries[unit.id] = entry;
  return entry;
}

function backfillLegacyOrderedContexts(units: readonly Candidate[], state: TranslationStateFile): number {
  const entries = Object.values(state.entries);
  if (entries.length !== units.length || !entries.length) return 0;
  const currentCounts = fingerprintCounts(units.map(unitSourceFingerprint));
  const legacyFingerprints = entries.map(entrySourceFingerprint);
  const legacyCounts = fingerprintCounts(legacyFingerprints);
  if (!sameFingerprintCounts(currentCounts, legacyCounts)) return 0;

  let changed = 0;
  entries.forEach((entry, index) => {
    const sourceFingerprint = legacyFingerprints[index];
    if (entry.sourceFingerprint !== sourceFingerprint) {
      entry.sourceFingerprint = sourceFingerprint;
      changed += 1;
    }
    if (!entry.contextFingerprint) {
      const previous = index > 0 ? legacyFingerprints[index - 1] : "^";
      const next = index + 1 < entries.length ? legacyFingerprints[index + 1] : "$";
      entry.contextFingerprint = translationContextFingerprint(previous, sourceFingerprint, next);
      changed += 1;
    }
  });
  return changed;
}

function fingerprintCounts(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function sameFingerprintCounts(left: ReadonlyMap<string, number>, right: ReadonlyMap<string, number>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (right.get(key) !== value) return false;
  return true;
}

function matchingEntry(unit: Candidate, state: TranslationStateFile): TranslationEntry | undefined {
  const sourceFingerprint = unitSourceFingerprint(unit);
  const exact = state.entries[unit.id];
  if (exact && entrySourceFingerprint(exact) === sourceFingerprint) return exact;

  const candidates = Object.values(state.entries).filter((entry) => entrySourceFingerprint(entry) === sourceFingerprint);
  if (!candidates.length) return undefined;

  if (unit.translationContextFingerprint) {
    const contextual = candidates.filter((entry) => entry.contextFingerprint === unit.translationContextFingerprint);
    if (contextual.length === 1) return contextual[0];
    if (contextual.length > 1) return newestEntry(contextual);
  }

  if ((unit.translationSourceOccurrenceCount ?? 1) > 1) return undefined;
  if (candidates.length === 1) return candidates[0];
  return entriesHaveEquivalentResults(candidates) ? newestEntry(candidates) : undefined;
}

function entriesHaveEquivalentResults(entries: TranslationEntry[]): boolean {
  const canonical = entries.map((entry) => JSON.stringify(
    Object.entries(entry.translations)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([serviceId, result]) => [serviceId, result.status, result.translatedText, result.error, result.model]),
  ));
  return new Set(canonical).size === 1;
}

function newestEntry(entries: TranslationEntry[]): TranslationEntry {
  return [...entries].sort((left, right) => latestUpdate(right).localeCompare(latestUpdate(left)))[0];
}

function latestUpdate(entry: TranslationEntry): string {
  return Object.values(entry.translations).reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, "");
}

function unitSourceFingerprint(unit: Candidate): string {
  return unit.translationSourceFingerprint ?? translationSourceFingerprint(unit.raw);
}

function entrySourceFingerprint(entry: TranslationEntry): string {
  return entry.sourceFingerprint ?? translationSourceFingerprint(entry.sourceText);
}
