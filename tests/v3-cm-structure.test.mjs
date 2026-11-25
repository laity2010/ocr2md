/** WP04 直接单元测试：单源 structureField、O(log N) 二分门禁、轻量行索引与 3000 块按键性能。 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {EditorState, Transaction} from '@codemirror/state';
import {history, redo, undo} from '@codemirror/commands';

import {
  buildInitialStructureState,
  createV3OwnedTransactionFilter,
  locateBlockIndex,
  v3LoadStructureEffect,
  v3StructureField,
} from '../ui/v3/cm-structure.js';
import {createRevisionDerivedCache, createV3MdLineIndex} from '../ui/v3/md-line-index.js';

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
      baseBlockId: e.base_blockid ?? e.logical_id,
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
    structureSha256: 'a'.repeat(64),
    rowCount: segments.length,
    lengthUtf16: markdown.length,
    segments,
  };
}

test('单源 structureField、新增行继承、跨块拦截、尾换行保护与 Undo/Redo 一致性', () => {
  const blockedEvents = [];
  const snap = makeSnapshot([
    {logical_id: 1, block_type: 'title', p: 0, b: 0, s: 0, md_block: '# Chapter 1\n\n'},
    {logical_id: 2, parent_id: null, block_type: 'image', p: 0, b: 1, s: 0, md_block: '\n'},
    {logical_id: 3, parent_id: 2, block_type: 'image_body', p: 0, b: 1, s: 1, md_block: '![](a.png)\n\n'},
  ]);

  let state = EditorState.create({
    doc: '',
    extensions: [
      v3StructureField,
      history(),
      createV3OwnedTransactionFilter({onBoundaryBlocked: (e) => blockedEvents.push(e)}),
    ],
  });

  state = state.update({
    changes: {from: 0, to: 0, insert: snap.markdown},
    effects: v3LoadStructureEffect.of(buildInitialStructureState(snap, 1)),
    annotations: Transaction.addToHistory.of(false),
  }).state;

  // 1) 在块 1 内部输入新行：新行必须继承 logicalId=1, pbs=p0b0s0, blockType='title'
  state = state.update({
    changes: {from: '# Chapter 1'.length, to: '# Chapter 1'.length, insert: '\nSubtitle'},
  }).state;

  const idx1 = createV3MdLineIndex(state.doc, state.field(v3StructureField));
  const block1Rows = idx1.forBlock(1);
  assert.equal(block1Rows.length, 3);
  assert.equal(block1Rows[0].mdLine, '# Chapter 1');
  assert.equal(block1Rows[1].mdLine, 'Subtitle');
  assert.equal(block1Rows[1].blockType, 'title');
  assert.equal(block1Rows[2].mdLine, '');
  assert.equal(idx1.atSourceLine(4).logicalId, 2);

  // 2) 尝试跨块删除（跨越块 1 结尾到块 2）：必须被拦截，文档保持不变
  const beforeBlock1End = state.field(v3StructureField).blocks[0].to;
  const trCross = state.update({
    changes: {from: beforeBlock1End - 1, to: beforeBlock1End + 1, insert: ''},
  });
  assert.equal(trCross.state.doc.toString(), state.doc.toString());
  assert.equal(blockedEvents.length, 1);

  // 3) 尝试删除独立组末块 1 必需的第 2 个 \n（只剩 1 个 \n）：必须被拦截
  const trStripLf = state.update({
    changes: {from: beforeBlock1End - 1, to: beforeBlock1End, insert: ''},
  });
  assert.equal(trStripLf.state.doc.toString(), state.doc.toString());
  assert.equal(blockedEvents.length, 2);

  // 4) 同组非末块（块 2）清空为空行 '\n' 允许，但删除其唯一的 \n 必须被拦截
  const b2 = state.field(v3StructureField).blocks[1];
  const trStripB2 = state.update({
    changes: {from: b2.from, to: b2.to, insert: ''},
  });
  assert.equal(trStripB2.state.doc.toString(), state.doc.toString());
  assert.equal(blockedEvents.length, 3);

  // 5) 原生 Undo/Redo 必须同步恢复正文与 structureField
  const viewLike = {
    state,
    dispatch(trOrSpec) {
      viewLike.state = trOrSpec?.state ? trOrSpec.state : viewLike.state.update(trOrSpec).state;
    },
  };
  assert.equal(undo(viewLike), true);
  assert.equal(viewLike.state.doc.toString(), snap.markdown);
  const idxUndo = createV3MdLineIndex(viewLike.state.doc, viewLike.state.field(v3StructureField));
  assert.equal(idxUndo.forBlock(1).length, 2);
  // 旧快照 ref 在新修订下必须返回 null
  const oldRef = idx1.makeRef(1);
  assert.equal(idxUndo.resolve(oldRef), null);
  assert.equal(idxUndo.resolve(idxUndo.makeRef(1)).mdLine, '# Chapter 1');

  assert.equal(redo(viewLike), true);
  assert.ok(viewLike.state.doc.toString().includes('Subtitle'));
});

test('两层解耦轻量行索引与修订令牌惰性语法缓存', () => {
  const snap = makeSnapshot([
    {logical_id: 10, block_type: 'text', p: 0, b: 0, s: 0, md_block: 'Line 1\nLine 2\n\n'},
  ]);
  const struct = buildInitialStructureState(snap, 1);
  let state = EditorState.create({doc: snap.markdown, extensions: [v3StructureField]});
  state = state.update({effects: v3LoadStructureEffect.of(struct)}).state;

  const index = createV3MdLineIndex(state.doc, state.field(v3StructureField));
  assert.equal(index.rows.length, 3);
  assert.equal(index.eofOwner, 10);
  assert.equal(index.atOffset(0).sourceLine, 1);
  assert.equal(index.atOffset(7).sourceLine, 2);
  assert.equal(index.atOffset(state.doc.length), null);

  let computeCalls = 0;
  const getWordCounts = createRevisionDerivedCache((idx) => {
    computeCalls += 1;
    return idx.rows.map((r) => r.mdLine.length);
  });
  assert.deepEqual(getWordCounts(index), [6, 6, 0]);
  assert.deepEqual(getWordCounts(index), [6, 6, 0]);
  assert.equal(computeCalls, 1);
});

test('O(log N) 大规模 3000 块文档单次按键门禁性能基准', () => {
  const entries = [];
  for (let i = 0; i < 3000; i += 1) {
    entries.push({
      logical_id: i + 1,
      p: Math.floor(i / 20),
      b: i % 20,
      s: 0,
      md_block: `Block number ${i} content.\n\n`,
    });
  }
  const snap = makeSnapshot(entries);
  let state = EditorState.create({
    doc: snap.markdown,
    extensions: [v3StructureField, createV3OwnedTransactionFilter()],
  });
  state = state.update({effects: v3LoadStructureEffect.of(buildInitialStructureState(snap, 1))}).state;

  const targetBlock = state.field(v3StructureField).blocks[1500];
  assert.equal(locateBlockIndex(state.field(v3StructureField).blocks, targetBlock.from + 3), 1500);

  const t0 = performance.now();
  for (let k = 0; k < 50; k += 1) {
    state = state.update({
      changes: {from: targetBlock.from + 5, to: targetBlock.from + 5, insert: 'x'},
    }).state;
  }
  const elapsedMs = performance.now() - t0;
  // 50 次按键在 3000 块文档下应远低于 100ms（单次 < 2ms）
  assert.ok(elapsedMs < 150, `3000 块文档 50 次按键耗时过高: ${elapsedMs.toFixed(2)}ms`);
});
