/** WP07 · 第二层独立语法派生层（标题 + 注释配对）。
 *
 * 严格遵循 CM.md 第 3 节与 VIEWS.md 第 2 节：
 * 1. 仅消费 createV3MdLineIndex() 产出的轻量行索引与修订令牌；
 * 2. 通过 createRevisionDerivedCache 按修订惰性计算，绝不反写 blockType 或修改 v3StructureField；
 * 3. 正确跳过 Markdown 代码围栏（``` / ~~~）内部的伪标题与伪脚注。
 */
import {createRevisionDerivedCache} from './md-line-index.js';

const ATX_HEADING_RE = /^\s{0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/;
const FENCE_OPEN_RE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
const FOOTNOTE_DEF_RE = /^\s{0,3}\[\^([^\s\]]+)\]:\s*(.*)$/;
const FOOTNOTE_REF_RE = /\[\^([^\s\]]+)\](?!:)/g;

function stripClosingHashes(rawText) {
  const trimmed = String(rawText ?? '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim();
}

function isClosingFence(line, fenceChar, fenceLen) {
  const m = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line);
  if (!m) return false;
  return m[1][0] === fenceChar && m[1].length >= fenceLen;
}

/** 扫描非代码围栏行的生成器，避免各语法派生器重复维护围栏状态。 */
function forEachActiveLine(lineIndex, visitor) {
  const rows = lineIndex?.rows || [];
  let fenceChar = '';
  let fenceLen = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const line = row.mdLine;
    if (fenceChar) {
      if (isClosingFence(line, fenceChar, fenceLen)) {
        fenceChar = '';
        fenceLen = 0;
      }
      continue;
    }
    const openMatch = FENCE_OPEN_RE.exec(line);
    if (openMatch) {
      const marker = openMatch[1];
      // CommonMark 规范：反引号围栏的 info string 中不能再包含反引号
      if (marker[0] !== '`' || !openMatch[2].includes('`')) {
        fenceChar = marker[0];
        fenceLen = marker.length;
        continue;
      }
    }
    visitor(row, line);
  }
}

/** 从轻量行索引派生只读 ATX 标题列表。 */
export function deriveHeadingsFromIndex(lineIndex) {
  const list = [];
  forEachActiveLine(lineIndex, (row, line) => {
    const m = ATX_HEADING_RE.exec(line);
    if (!m) return;
    const levelNum = m[1].length;
    const headingText = stripClosingHashes(m[2]);
    list.push(
      Object.freeze({
        logicalId: row.logicalId,
        logical_id: row.logicalId,
        baseBlockId: row.baseBlockId,
        p: row.p,
        b: row.b,
        s: row.s,
        pbs: row.pbs,
        block_type: row.blockType,
        blockType: row.blockType,
        source_line: row.sourceLine,
        sourceLine: row.sourceLine,
        lineOffset: row.lineOffset,
        levelNum,
        level: `H${levelNum}`,
        headingText,
        mdLine: line,
      }),
    );
  });
  return Object.freeze(list);
}

/** 从轻量行索引派生只读跨页注释（脚注/尾注）配对列表。 */
export function deriveFootnotesFromIndex(lineIndex) {
  const refsById = new Map();
  const defsById = new Map();
  const entries = [];

  forEachActiveLine(lineIndex, (row, line) => {
    const defMatch = FOOTNOTE_DEF_RE.exec(line);
    if (defMatch) {
      const noteId = defMatch[1];
      const defList = defsById.get(noteId) || [];
      defList.push(row.sourceLine);
      defsById.set(noteId, defList);
      entries.push({row, noteId, role: 'def'});
      return;
    }

    FOOTNOTE_REF_RE.lastIndex = 0;
    let refMatch;
    while ((refMatch = FOOTNOTE_REF_RE.exec(line)) !== null) {
      const noteId = refMatch[1];
      const refList = refsById.get(noteId) || [];
      refList.push(row.sourceLine);
      refsById.set(noteId, refList);
      entries.push({row, noteId, role: 'ref'});
    }
  });

  const rows = entries.map(({row, noteId, role}) => {
    const refs = refsById.get(noteId) || [];
    const defs = defsById.get(noteId) || [];
    let pairStatus = 'matched';
    if (defs.length > 1) {
      pairStatus = 'duplicate_def';
    } else if (defs.length === 0) {
      pairStatus = 'orphan_ref';
    } else if (refs.length === 0) {
      pairStatus = 'unused_def';
    }
    const peerLines = role === 'ref' ? defs : refs;
    const peerSummary =
      peerLines.length > 0 ? peerLines.map((ln) => `L${ln}`).join(', ') : '缺失';

    return Object.freeze({
      logicalId: row.logicalId,
      logical_id: row.logicalId,
      baseBlockId: row.baseBlockId,
      p: row.p,
      b: row.b,
      s: row.s,
      pbs: row.pbs,
      block_type: row.blockType,
      blockType: row.blockType,
      noteId: `[^${noteId}]`,
      rawNoteId: noteId,
      role,
      roleLabel: role === 'def' ? '定义' : '引用',
      pairStatus,
      peerLines: Object.freeze([...peerLines]),
      peerSummary,
      source_line: row.sourceLine,
      sourceLine: row.sourceLine,
      lineOffset: row.lineOffset,
      mdLine: row.mdLine,
    });
  });

  return Object.freeze(rows);
}

/** 创建按轻量索引 revision 惰性缓存的语法派生器实例。 */
export function createV3SyntaxDerived() {
  const getHeadings = createRevisionDerivedCache(deriveHeadingsFromIndex);
  const getFootnotes = createRevisionDerivedCache(deriveFootnotesFromIndex);

  return Object.freeze({
    getHeadings,
    getFootnotes,
  });
}
