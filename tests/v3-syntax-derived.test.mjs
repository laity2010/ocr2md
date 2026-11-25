/** WP07 语法派生层直接测试：ATX 标题识别、代码围栏隔离、跨页注释配对与修订缓存。 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {EditorState} from '@codemirror/state';
import {buildInitialStructureState, v3LoadStructureEffect, v3StructureField} from '../ui/v3/cm-structure.js';
import {createV3MdLineIndex} from '../ui/v3/md-line-index.js';
import {
  createV3SyntaxDerived,
  deriveFootnotesFromIndex,
  deriveHeadingsFromIndex,
} from '../ui/v3/syntax-derived.js';

function makeState(segments) {
  const markdown = segments.map((s) => s.text).join('');
  let cursor = 0;
  const snapshot = {
    schema: 'v3-logical-md/v1',
    markdown,
    segments: segments.map((s, idx) => {
      const startChar = cursor;
      cursor += s.text.length;
      return {
        logicalId: idx + 1,
        baseBlockId: idx + 1,
        parentId: null,
        logicalOrder: idx + 1,
        blockType: s.blockType || 'text',
        p: s.p ?? 0,
        b: s.b ?? idx,
        s: s.s ?? 0,
        rawPath: '$',
        startChar,
        endChar: cursor,
        startUtf16: startChar,
        endUtf16: cursor,
        fragmentSha256: String(idx + 1).repeat(64).slice(0, 64),
      };
    }),
  };
  const initial = buildInitialStructureState(snapshot);
  return EditorState.create({doc: markdown, extensions: [v3StructureField]})
    .update({effects: v3LoadStructureEffect.of(initial)}).state;
}

test('ATX 标题派生：识别 H1-H6、剥离尾部 #、跳过代码围栏内部伪标题且不回写 blockType', () => {
  const state = makeState([
    {p: 0, b: 0, blockType: 'title', text: '# 主标题\n\n'},
    {p: 0, b: 1, blockType: 'text', text: '## 二级标题 ##\n正文非标题\n\n'},
    {p: 1, b: 0, blockType: 'code', text: '```markdown\n# 围栏内伪标题\n[^fake]: 围栏内伪脚注\n```\n\n'},
    {p: 1, b: 1, blockType: 'text', text: '~~~bash\n## 波浪围栏伪标题\n~~~\n### 三级标题\n\n'},
  ]);
  const lineIndex = createV3MdLineIndex(state.doc, state.field(v3StructureField));
  const headings = deriveHeadingsFromIndex(lineIndex);

  assert.equal(headings.length, 3);
  assert.deepEqual(
    headings.map((h) => ({level: h.level, text: h.headingText, line: h.source_line, pbs: h.pbs})),
    [
      {level: 'H1', text: '主标题', line: 1, pbs: 'p0b0s0'},
      {level: 'H2', text: '二级标题', line: 3, pbs: 'p0b1s0'},
      {level: 'H3', text: '三级标题', line: 14, pbs: 'p1b1s0'},
    ],
  );
  // 确认未修改单源 structureField 中的 blockType
  assert.equal(state.field(v3StructureField).blocks[1].blockType, 'text');
});

test('跨页注释配对与修订令牌惰性缓存：matched / orphan_ref / unused_def / duplicate_def', () => {
  const state = makeState([
    {p: 0, b: 0, text: '第一页引用[^1]与缺失引用[^missing]。\n\n'},
    {p: 1, b: 0, text: '[^1]: 第一条脚注定义\n[^unused]: 无人引用的定义\n[^dup]: 定义 A\n[^dup]: 定义 B\n\n'},
  ]);
  const lineIndex = createV3MdLineIndex(state.doc, state.field(v3StructureField));
  const syntax = createV3SyntaxDerived();

  const fn1 = syntax.getFootnotes(lineIndex);
  const fn2 = syntax.getFootnotes(lineIndex);
  assert.equal(fn1, fn2, '同一 revision 令牌应命中缓存并返回同一冻结数组');

  assert.deepEqual(
    fn1.map((r) => ({id: r.rawNoteId, role: r.role, status: r.pairStatus, peer: r.peerSummary, line: r.source_line})),
    [
      {id: '1', role: 'ref', status: 'matched', peer: 'L3', line: 1},
      {id: 'missing', role: 'ref', status: 'orphan_ref', peer: '缺失', line: 1},
      {id: '1', role: 'def', status: 'matched', peer: 'L1', line: 3},
      {id: 'unused', role: 'def', status: 'unused_def', peer: '缺失', line: 4},
      {id: 'dup', role: 'def', status: 'duplicate_def', peer: '缺失', line: 5},
      {id: 'dup', role: 'def', status: 'duplicate_def', peer: '缺失', line: 6},
    ],
  );

  const direct = deriveFootnotesFromIndex(lineIndex);
  assert.equal(direct.length, 6);
});
