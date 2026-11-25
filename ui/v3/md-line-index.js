/** WP04B · 两层解耦轻量公共行索引（Light MD Line Index）。
 *
 * 严格遵循 CM.md 第 3 节：
 * 1. 仅消费同一修订的 CM6 Text (doc) 与 v3StructureField (structureState)；
 * 2. 不包含 ATX 标题、代码围栏、LaTeX 等语法扫描，保持按键与聚焦路径极简轻量；
 * 3. 独立提供按修订令牌缓存的语法派生辅助 createRevisionDerivedCache，供后续 View 消费。
 */
import {locateBlockIndex} from './cm-structure.js';

function binarySearchRowByOffset(rows, pos) {
  let lo = 0;
  let hi = rows.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const r = rows[mid];
    if (pos < r.from) {
      hi = mid - 1;
    } else if (pos >= r.to) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }
  return -1;
}

/** 从同一修订的 (doc, structureState) 派生只读轻量 MD Line 行索引。 */
export function createV3MdLineIndex(doc, structureState) {
  if (!doc || typeof doc.sliceString !== 'function') {
    throw new Error('createV3MdLineIndex 需要有效的 CM6 Text 对象');
  }
  if (!structureState || !Array.isArray(structureState.blocks)) {
    throw new Error('createV3MdLineIndex 需要有效的 v3StructureField 状态');
  }

  const blocks = structureState.blocks;
  const revision = Object.freeze({token: Symbol('v3-md-line-revision'), stateRevision: structureState.revision});
  const rows = [];
  const rowsByBlockId = new Map();

  let cursor = 0;
  let sourceLine = 1;

  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    if (b.from !== cursor || b.to < b.from || b.to > doc.length) {
      throw new Error(`轻量行索引区间校验失败：块 ${b.logicalId} [${b.from}, ${b.to}) 不连续`);
    }
    cursor = b.to;

    const blockText = doc.sliceString(b.from, b.to);
    const pbs = `p${b.p}b${b.b}s${b.s}`;
    const blockRows = [];

    let lineStartLocal = 0;
    let lineOffset = 0;
    for (let pos = 0; pos < blockText.length; pos += 1) {
      if (blockText.charCodeAt(pos) === 10) {
        const from = b.from + lineStartLocal;
        const to = b.from + pos + 1;
        const textTo = to - 1;
        const mdLine = blockText.slice(lineStartLocal, pos);
        const row = Object.freeze({
          logicalId: b.logicalId,
          baseBlockId: b.baseBlockId,
          parentId: b.parentId,
          logicalOrder: b.logicalOrder,
          blockType: b.blockType,
          p: b.p,
          b: b.b,
          s: b.s,
          pbs,
          rawPath: b.rawPath ?? null,
          lineOffset,
          sourceLine,
          from,
          to,
          textTo,
          mdLine,
        });
        rows.push(row);
        blockRows.push(row);
        sourceLine += 1;
        lineOffset += 1;
        lineStartLocal = pos + 1;
      }
    }
    if (lineStartLocal !== blockText.length) {
      throw new Error(`逻辑块 ${b.logicalId} 末尾缺少真实 LF，违反 owned-LF 模型`);
    }
    rowsByBlockId.set(b.logicalId, Object.freeze(blockRows));
  }

  if (cursor !== doc.length) {
    throw new Error('轻量行索引末尾存在未映射文本');
  }

  const frozenRows = Object.freeze(rows);
  const eofOwner = blocks.length > 0 ? blocks[blocks.length - 1].logicalId : null;

  function atSourceLine(n) {
    if (!Number.isInteger(n) || n < 1 || n > frozenRows.length) return null;
    return frozenRows[n - 1];
  }

  function forBlock(logicalId) {
    return rowsByBlockId.get(logicalId) || Object.freeze([]);
  }

  function atBlockLine(logicalId, offset) {
    if (!Number.isInteger(offset) || offset < 0) return null;
    const list = rowsByBlockId.get(logicalId);
    return list && offset < list.length ? list[offset] : null;
  }

  function atOffset(pos) {
    if (!Number.isInteger(pos) || pos < 0 || pos >= doc.length) return null;
    const idx = binarySearchRowByOffset(frozenRows, pos);
    return idx >= 0 ? frozenRows[idx] : null;
  }

  function blockAtOffset(pos) {
    const idx = locateBlockIndex(blocks, pos);
    return idx >= 0 ? blocks[idx] : null;
  }

  function makeRef(n) {
    const row = atSourceLine(n);
    if (!row) return null;
    return Object.freeze({
      revision,
      logicalId: row.logicalId,
      lineOffset: row.lineOffset,
    });
  }

  function resolve(ref) {
    if (!ref || ref.revision !== revision) return null;
    return atBlockLine(ref.logicalId, ref.lineOffset);
  }

  return Object.freeze({
    revision,
    rows: frozenRows,
    eofOwner,
    atSourceLine,
    forBlock,
    atBlockLine,
    atOffset,
    blockAtOffset,
    makeRef,
    resolve,
  });
}

/** 第二层：独立语法派生缓存辅助（按轻量索引 revision 令牌惰性计算，不反写 blockType）。 */
export function createRevisionDerivedCache(computeFn) {
  let cachedRev = null;
  let cachedValue = null;
  return (lineIndex, ...args) => {
    if (!lineIndex || !lineIndex.revision) {
      throw new Error('语法派生层必须消费有效的轻量行索引');
    }
    if (cachedRev === lineIndex.revision && args.length === 0) {
      return cachedValue;
    }
    const result = computeFn(lineIndex, ...args);
    if (args.length === 0) {
      cachedRev = lineIndex.revision;
      cachedValue = result;
    }
    return result;
  };
}
