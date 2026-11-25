/** WP05 直接单元测试：局部 ChangeSpec 结构拖拽规划器与原生 Undo/Redo 同步逆转。 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {EditorState, Transaction} from '@codemirror/state';
import {history, redo, undo} from '@codemirror/commands';

import {
  buildInitialStructureState,
  v3ApplyStructureMoveEffect,
  v3LoadStructureEffect,
  v3StructureCommitAnnotation,
  v3StructureField,
  v3StructureHistoryExtension,
} from '../ui/v3/cm-structure.js';
import {planLocalStructureMove} from '../ui/v3/structure-move.js';

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function makeSnapshot(entries) {
  let markdown = '';
  let cursor = 0;
  const segments = entries.map((e, idx) => {
    const startUtf16 = cursor;
    const endUtf16 = cursor + e.md_block.length;
    markdown += e.md_block;
    cursor = endUtf16;
    return {
      logicalId: e.logical_id,
      baseBlockId: e.logical_id,
      parentId: e.parent_id ?? null,
      logicalOrder: idx + 1,
      blockType: e.block_type ?? 'text',
      p: e.p,
      b: e.b,
      s: e.s,
      rawPath: '$',
      startChar: startUtf16,
      endChar: endUtf16,
      startUtf16,
      endUtf16,
      fragmentSha256: sha256(e.md_block),
    };
  });
  return {
    schema: 'v3-logical-md/v1',
    markdown,
    sha256: sha256(markdown),
    structureSha256: 'd'.repeat(64),
    rowCount: segments.length,
    lengthUtf16: markdown.length,
    segments,
  };
}

test('局部 ChangeSpec 兄弟块交换、归入子块（2 LF -> 1 LF）与原生 Undo/Redo 同步恢复', () => {
  const snap = makeSnapshot([
    {logical_id: 1, block_type: 'title', p: 0, b: 0, s: 0, md_block: '# Title A\n\n'},
    {logical_id: 2, block_type: 'text', p: 0, b: 1, s: 0, md_block: 'Paragraph B\n\n'},
    {logical_id: 3, block_type: 'text', p: 0, b: 2, s: 0, md_block: 'Paragraph C\n\n'},
  ]);

  let state = EditorState.create({
    doc: '',
    extensions: [v3StructureField, v3StructureHistoryExtension, history()],
  });
  state = state.update({
    changes: {from: 0, to: 0, insert: snap.markdown},
    effects: v3LoadStructureEffect.of(buildInitialStructureState(snap, 1)),
    annotations: Transaction.addToHistory.of(false),
  }).state;

  // 1) 将块 3 归入块 2 为 child（p0b1s1）：严禁全文 {from:0, to:doc.length} 替换
  const prev1 = state.field(v3StructureField);
  const plan1 = planLocalStructureMove(state.doc, prev1, {
    sourceBlockId: 3,
    targetBlockId: 2,
    placement: 'child',
  });
  assert.equal(plan1.unchanged, false);
  assert.equal(
    plan1.changes.some((c) => c.from === 0 && c.to === state.doc.length),
    false,
    '禁止使用全文替换 ChangeSpec',
  );

  state = state.update({
    changes: plan1.changes,
    annotations: v3StructureCommitAnnotation.of(true),
    effects: v3ApplyStructureMoveEffect.of({prevStruct: prev1, nextStruct: plan1.nextStruct}),
  }).state;

  assert.equal(state.doc.toString(), '# Title A\n\nParagraph B\nParagraph C\n\n');
  const sAfterMove = state.field(v3StructureField);
  assert.equal(sAfterMove.blocks[1].p, 0);
  assert.equal(sAfterMove.blocks[1].b, 1);
  assert.equal(sAfterMove.blocks[1].s, 0);
  assert.equal(sAfterMove.blocks[2].parentId, 2);
  assert.equal(sAfterMove.blocks[2].s, 1);
  assert.equal(sAfterMove.blocks[2].to, state.doc.length);

  // 2) 原生 Undo 必须把 doc 与 v3StructureField 同步还原
  const viewLike = {
    state,
    dispatch(trOrSpec) {
      viewLike.state = trOrSpec?.state ? trOrSpec.state : viewLike.state.update(trOrSpec).state;
    },
  };
  assert.equal(undo(viewLike), true);
  assert.equal(viewLike.state.doc.toString(), snap.markdown);
  const sUndo = viewLike.state.field(v3StructureField);
  assert.equal(sUndo.blocks[2].parentId, null);
  assert.equal(sUndo.blocks[2].b, 2);
  assert.equal(sUndo.blocks[2].s, 0);

  // 3) 原生 Redo 同步重做结构与正文
  assert.equal(redo(viewLike), true);
  assert.equal(viewLike.state.doc.toString(), '# Title A\n\nParagraph B\nParagraph C\n\n');
  assert.equal(viewLike.state.field(v3StructureField).blocks[2].parentId, 2);
});

test('禁止孙块与非法落点，已正确排序时不产生冗余 ChangeSpec', () => {
  const snap = makeSnapshot([
    {logical_id: 10, p: 0, b: 0, s: 0, md_block: 'Root\n'},
    {logical_id: 11, parent_id: 10, p: 0, b: 0, s: 1, md_block: 'Child\n\n'},
    {logical_id: 12, p: 0, b: 1, s: 0, md_block: 'Next Root\n\n'},
  ]);
  const struct = buildInitialStructureState(snap, 1);
  const doc = EditorState.create({doc: snap.markdown}).doc;

  assert.throws(
    () => planLocalStructureMove(doc, struct, {sourceBlockId: 11, targetBlockId: 10, placement: 'child'}),
    /只能将独立父块组归入其他父块组/,
  );
  const noop = planLocalStructureMove(doc, struct, {sourceBlockId: 10, targetBlockId: 12, placement: 'before'});
  assert.equal(noop.unchanged, true);
  assert.deepEqual(noop.changes, []);
});
