import * as assert from "assert";
import type { Candidate } from "./types";
import {
  emptyTranslationState,
  isSentenceTranslated,
  parseTranslationState,
  recordTranslation,
  recordTranslationError,
  serializeTranslationState,
  translationProgress,
  translationRows,
} from "./translationState";

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
assert.deepStrictEqual(translationProgress(rows, state), { phase: "idle", completed: 0, total: 2, failed: 0, current: undefined });

recordTranslation(state, rows[0], "第一句。", "2026-08-25T00:00:00.000Z");
recordTranslationError(state, rows[1], "temporary failure", "2026-08-25T00:00:01.000Z");
assert.strictEqual(isSentenceTranslated(rows[0], state), true);
assert.strictEqual(isSentenceTranslated(rows[1], state), false);
assert.deepStrictEqual(translationProgress(rows, state), { phase: "idle", completed: 1, total: 2, failed: 1, current: undefined });

const decorated = translationRows(rows, state);
assert.strictEqual(decorated[0].typeLabel, "翻译");
assert.strictEqual(decorated[0].translationStatus, "已翻译");
assert.strictEqual(decorated[0].translationText, "第一句。");
assert.strictEqual(decorated[1].translationStatus, "失败");
assert.strictEqual(decorated[1].translationError, "temporary failure");

const parsed = parseTranslationState(serializeTranslationState(state), "/new/location/chapter.md");
assert.strictEqual(parsed.sourcePath, "/new/location/chapter.md");
assert.strictEqual(parsed.entries.s1.translatedText, "第一句。");

const changedSentence = sentence("s1", "Changed source.", 1);
assert.strictEqual(isSentenceTranslated(changedSentence, state), false, "changed source must never reuse a stale translation");
assert.strictEqual(translationRows([changedSentence], state)[0].translationStatus, "待翻译");

assert.deepStrictEqual(parseTranslationState("not json", "/tmp/chapter.md"), emptyTranslationState("/tmp/chapter.md"));

console.log("translationState tests passed");
