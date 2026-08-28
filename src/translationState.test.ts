import * as assert from "assert";
import type { Candidate } from "./types";
import {
  backfillTranslationFingerprints,
  emptyTranslationState,
  isSentenceTranslated,
  parseTranslationState,
  recordTranslation,
  recordTranslationError,
  serializeTranslationState,
  translationProgress,
  translationRows,
} from "./translationState";
import { translationContextFingerprint, translationSourceFingerprint } from "./translationUnits";

const sentence = (id: string, raw: string, index: number): Candidate => ({
  id,
  kind: "regex",
  label: raw,
  raw,
  preview: raw,
  range: { line: index - 1, start: 0, end: raw.length },
  typeLabel: "分句",
  lineType: "文本",
  parentBlockId: "block-1",
  parentBlockIndex: 1,
  sentenceIndex: index,
});

const rows = [sentence("s1", "First sentence.", 1), sentence("s2", "Second sentence.", 2)];
const state = emptyTranslationState("/tmp/chapter.md");
assert.deepStrictEqual(translationProgress(rows, state), { phase: "idle", completed: 0, total: 2, failed: 0, current: undefined, serviceId: "deepl" });

recordTranslation(state, rows[0], "第一句。", "2026-08-25T00:00:00.000Z");
recordTranslationError(state, rows[1], "temporary failure", "2026-08-25T00:00:01.000Z");
assert.strictEqual(isSentenceTranslated(rows[0], state), true);
assert.strictEqual(isSentenceTranslated(rows[1], state), false);
assert.deepStrictEqual(translationProgress(rows, state), { phase: "idle", completed: 1, total: 2, failed: 1, current: undefined, serviceId: "deepl" });

const decorated = translationRows(rows, state);
assert.strictEqual(decorated[0].typeLabel, "翻译");
assert.strictEqual(decorated[0].translationStatus, "已翻译");
assert.strictEqual(decorated[0].translationText, "第一句。");
assert.strictEqual(decorated[1].translationStatus, "失败");
assert.strictEqual(decorated[1].translationError, "temporary failure");

const parsed = parseTranslationState(serializeTranslationState(state), "/new/location/chapter.md");
assert.strictEqual(parsed.sourcePath, "/new/location/chapter.md");
assert.strictEqual(parsed.entries.s1.translations.deepl.translatedText, "第一句。");


// Positional ids must not invalidate a translation when source content is unchanged.
const moved = sentence("moved-s1", "First sentence.", 8);
moved.parentBlockId = "block-after-layout-change";
moved.parentBlockIndex = 99;
moved.translationSourceFingerprint = translationSourceFingerprint(moved.raw);
moved.translationSourceOccurrenceCount = 1;
moved.translationContextFingerprint = "ctx-first";
assert.strictEqual(isSentenceTranslated(moved, state), true, "same source content must survive positional id changes");
assert.strictEqual(translationRows([moved], state)[0].translationText, "第一句。");

// Whitespace-only layout changes should share the same content fingerprint.
const whitespaceState = emptyTranslationState("/tmp/whitespace.md");
const wrappedOld = sentence("wrapped-old", "A wrapped\nsentence.", 1);
recordTranslation(whitespaceState, wrappedOld, "一个换行的句子。");
const wrappedNew = sentence("wrapped-new", "A wrapped sentence.", 2);
wrappedNew.translationSourceFingerprint = translationSourceFingerprint(wrappedNew.raw);
wrappedNew.translationSourceOccurrenceCount = 1;
assert.strictEqual(isSentenceTranslated(wrappedNew, whitespaceState), true, "layout whitespace must not force retranslation");

// Repeated identical source is safe only when translation is unambiguous or context matches.
const duplicateState = emptyTranslationState("/tmp/duplicate.md");
const oldDupA = sentence("old-dup-a", "Repeated source.", 1);
const oldDupB = sentence("old-dup-b", "Repeated source.", 2);
recordTranslation(duplicateState, oldDupA, "译文甲");
recordTranslation(duplicateState, oldDupB, "译文乙");
const newDupA = sentence("new-dup-a", "Repeated source.", 10);
newDupA.translationSourceFingerprint = translationSourceFingerprint(newDupA.raw);
newDupA.translationSourceOccurrenceCount = 2;
newDupA.translationContextFingerprint = "context-a";
assert.strictEqual(isSentenceTranslated(newDupA, duplicateState), false, "ambiguous repeated source must not pick an arbitrary old translation");
recordTranslation(duplicateState, newDupA, "译文甲");
const movedDupA = sentence("moved-dup-a", "Repeated source.", 30);
movedDupA.translationSourceFingerprint = newDupA.translationSourceFingerprint;
movedDupA.translationSourceOccurrenceCount = 2;
movedDupA.translationContextFingerprint = "context-a";
assert.strictEqual(isSentenceTranslated(movedDupA, duplicateState), true, "context fingerprint must recover repeated-source translations after id changes");
assert.strictEqual(translationRows([movedDupA], duplicateState)[0].translationText, "译文甲");

const backfilled = backfillTranslationFingerprints([moved], state);
assert.ok(backfilled >= 1, "legacy reused entries should receive stable fingerprint metadata");
assert.strictEqual(state.entries.s1.sourceFingerprint, moved.translationSourceFingerprint);

// A complete legacy v1 state can recover duplicate contexts from its insertion order
// when the current document has the same source-content multiset.
const legacyOrdered = emptyTranslationState("/tmp/legacy-ordered.md");
const legacySequence = [
  ["old-a", "Neighbor A.", "邻句甲。"],
  ["old-r1", "Repeated ordered source.", "重复译文一。"],
  ["old-b", "Neighbor B.", "邻句乙。"],
  ["old-c", "Neighbor C.", "邻句丙。"],
  ["old-r2", "Repeated ordered source.", "重复译文二。"],
  ["old-d", "Neighbor D.", "邻句丁。"],
] as const;
legacySequence.forEach(([id, raw, translated], index) => recordTranslation(legacyOrdered, sentence(id, raw, index + 1), translated));
// Strip new metadata to emulate an actual legacy v1 file.
Object.values(legacyOrdered.entries).forEach((entry) => {
  delete entry.sourceFingerprint;
  delete entry.contextFingerprint;
});
const currentRaw = legacySequence.map(([, raw]) => raw);
const currentFingerprints = currentRaw.map(translationSourceFingerprint);
const occurrenceCounts = new Map<string, number>();
currentFingerprints.forEach((fp) => occurrenceCounts.set(fp, (occurrenceCounts.get(fp) ?? 0) + 1));
const currentLegacyUnits = currentRaw.map((raw, index) => {
  const unit = sentence(`new-${index}`, raw, index + 20);
  const fp = currentFingerprints[index];
  unit.translationSourceFingerprint = fp;
  unit.translationSourceOccurrenceCount = occurrenceCounts.get(fp);
  unit.translationContextFingerprint = translationContextFingerprint(
    index > 0 ? currentFingerprints[index - 1] : "^",
    fp,
    index + 1 < currentFingerprints.length ? currentFingerprints[index + 1] : "$",
  );
  return unit;
});
assert.ok(backfillTranslationFingerprints(currentLegacyUnits, legacyOrdered) > 0);
assert.strictEqual(isSentenceTranslated(currentLegacyUnits[1], legacyOrdered), true);
assert.strictEqual(isSentenceTranslated(currentLegacyUnits[4], legacyOrdered), true);
assert.strictEqual(translationRows([currentLegacyUnits[1]], legacyOrdered)[0].translationText, "重复译文一。");
assert.strictEqual(translationRows([currentLegacyUnits[4]], legacyOrdered)[0].translationText, "重复译文二。");


// Multiple providers coexist on one source identity without overwriting each other.
recordTranslation(state, rows[0], "GPT第一句。", undefined, "openai", "gpt-test");
assert.strictEqual(translationRows([rows[0]], state, "deepl")[0].translationResults?.deepl.translatedText, "第一句。");
assert.strictEqual(translationRows([rows[0]], state, "openai")[0].translationResults?.openai.translatedText, "GPT第一句。");
assert.strictEqual(translationRows([rows[0]], state, "openai")[0].translationText, "GPT第一句。");
assert.strictEqual(isSentenceTranslated(rows[0], state, "openai"), true);
assert.strictEqual(translationProgress(rows, state, "idle", undefined, "openai").completed, 1);

// v1 files migrate their single result into the DeepL slot.
const migratedV1 = parseTranslationState(JSON.stringify({
  version: 1,
  sourcePath: "/old.md",
  entries: { old: { sentenceId: "old", sourceText: "Legacy.", translatedText: "旧译文。", status: "translated", updatedAt: "2026-01-01" } },
}), "/new.md");
assert.strictEqual(migratedV1.version, 2);
assert.strictEqual(migratedV1.entries.old.translations.deepl.translatedText, "旧译文。");
assert.strictEqual(migratedV1.entries.old.translations.openai, undefined);

const changedSentence = sentence("s1", "Changed source.", 1);
assert.strictEqual(isSentenceTranslated(changedSentence, state), false, "changed source must never reuse a stale translation");
assert.strictEqual(translationRows([changedSentence], state)[0].translationStatus, "待翻译");

assert.deepStrictEqual(parseTranslationState("not json", "/tmp/chapter.md"), emptyTranslationState("/tmp/chapter.md"));

console.log("translationState tests passed");
