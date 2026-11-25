/** WP04B · 单源 CM6 structureField（Zero Shadow Cache）与 O(log N) 二分局部事务门禁。
 *
 * 严格遵循 CM.md 第 1、2、4 节：
 * 1. 唯一可编辑状态源：doc 与 v3StructureField 同存于不可变 EditorState，零外部可变副本；
 * 2. 单轨 owned-LF：同组相邻子块末尾至少 1 个 \n，独立组末至少 2 个 \n；
 * 3. O(log N) 按键级事务门禁：二分查找定位受影响 k 块，仅对受影响区间执行 sliceString
 *    与尾换行不变量校验，严禁在按键路径上调用全书 doc.toString() 或 JSON.stringify。
 */
import {Annotation, EditorState, StateEffect, StateField} from '@codemirror/state';

export const V3_STRUCTURE_SCHEMA = 'v3-structure/v1';

/** 仅用于结构事务（如加载/拖拽归组）的受控注解。 */
export const v3StructureCommitAnnotation = Annotation.define();

/** 整本书初始加载或显式重载时的原子置换 Effect。 */
export const v3LoadStructureEffect = StateEffect.define();

/** 局部编辑通过门禁后同步更新结构区间与增量脏 ID 的内部 Effect。 */
export const v3ApplyOwnedEditEffect = StateEffect.define();

/** 空文档结构常量。 */
export const EMPTY_V3_STRUCTURE = Object.freeze({
  schema: V3_STRUCTURE_SCHEMA,
  revision: 0,
  structureSha256: '',
  docLength: 0,
  blocks: Object.freeze([]),
});

/** O(log N) 二分查找：定位 UTF-16 偏移 pos 所属的逻辑块索引。 */
export function locateBlockIndex(blocks, pos) {
  const n = blocks.length;
  if (n === 0) return -1;
  if (pos <= 0) return 0;
  const totalLen = blocks[n - 1].to;
  if (pos >= totalLen) return n - 1;

  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const b = blocks[mid];
    if (pos < b.from) {
      hi = mid - 1;
    } else if (pos >= b.to) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }
  return Math.min(Math.max(lo, 0), n - 1);
}

/** 定位删除/替换区间 [fromA, toA] 触及的块索引范围 [firstIdx, lastIdx]。 */
export function locateAffectedSpan(blocks, fromA, toA) {
  if (blocks.length === 0) return [-1, -1];
  if (fromA === toA) {
    const idx = locateBlockIndex(blocks, fromA);
    return [idx, idx];
  }
  const firstIdx = locateBlockIndex(blocks, fromA);
  const lastIdx = locateBlockIndex(blocks, Math.max(fromA, toA - 1));
  return [firstIdx, lastIdx];
}

/** 计算某个块在当前序列下所需的最少尾换行数：同组至少 1 个 \n，组末至少 2 个 \n。 */
export function minRequiredLf(blocks, index) {
  const cur = blocks[index];
  const nxt = index + 1 < blocks.length ? blocks[index + 1] : null;
  return nxt && nxt.p === cur.p && nxt.b === cur.b ? 1 : 2;
}

/** 计算变更事务后的新结构状态，并在不满足单块归属或 owned-LF 边界时返回 {blocked}。 */
function computeNextStructure(prevStruct, tr) {
  const blocks = prevStruct.blocks;
  if (blocks.length === 0) {
    return {blocked: true, pos: 0, reason: '空文档无逻辑块归属'};
  }

  const rawChanges = [];
  tr.changes.iterChanges((fromA, toA, fromB, toB) => {
    rawChanges.push({fromA, toA, fromB, toB});
  });
  if (rawChanges.length === 0) {
    return {unchanged: true, nextStruct: prevStruct};
  }

  const perBlockDelta = new Map();
  const touchedIndices = new Set();

  for (const ch of rawChanges) {
    const [firstIdx, lastIdx] = locateAffectedSpan(blocks, ch.fromA, ch.toA);
    if (firstIdx < 0 || lastIdx < 0 || firstIdx !== lastIdx) {
      return {
        blocked: true,
        pos: ch.fromA,
        reason: '禁止跨逻辑块边界编辑或静默吞并',
      };
    }
    const delta = (ch.toB - ch.fromB) - (ch.toA - ch.fromA);
    perBlockDelta.set(firstIdx, (perBlockDelta.get(firstIdx) || 0) + delta);
    touchedIndices.add(firstIdx);
  }

  const sortedTouched = Array.from(touchedIndices).sort((a, b) => a - b);
  const changedLogicalIds = [];
  let cumulativeShift = 0;
  let touchedCursor = 0;
  const nextBlocks = new Array(blocks.length);

  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    const delta = perBlockDelta.get(i) || 0;
    const newFrom = b.from + cumulativeShift;
    const newTo = b.to + cumulativeShift + delta;

    if (touchedCursor < sortedTouched.length && sortedTouched[touchedCursor] === i) {
      touchedCursor += 1;
      if (newTo < newFrom) {
        return {blocked: true, pos: b.from, reason: '逻辑块长度不能为负'};
      }
      const fragment = tr.newDoc.sliceString(newFrom, newTo);
      if (fragment.includes('\r')) {
        return {blocked: true, pos: b.from, reason: '禁止写入 CR 字符'};
      }
      const minLf = minRequiredLf(blocks, i);
      if (!fragment.endsWith('\n'.repeat(minLf))) {
        return {
          blocked: true,
          pos: Math.max(0, b.to - minLf),
          reason: `必须保留块尾至少 ${minLf} 个真实换行`,
        };
      }
      changedLogicalIds.push(b.logicalId);
    }

    if (delta === 0 && cumulativeShift === 0) {
      nextBlocks[i] = b;
    } else {
      nextBlocks[i] = Object.freeze({
        ...b,
        from: newFrom,
        to: newTo,
      });
    }
    cumulativeShift += delta;
  }

  const expectedTotalLen = prevStruct.docLength + cumulativeShift;
  if (tr.newDoc.length !== expectedTotalLen || nextBlocks[nextBlocks.length - 1].to !== tr.newDoc.length) {
    return {blocked: true, pos: rawChanges[0].fromA, reason: '文档总长与逻辑区间校验不一致'};
  }

  const nextStruct = Object.freeze({
    schema: V3_STRUCTURE_SCHEMA,
    revision: prevStruct.revision + 1,
    structureSha256: prevStruct.structureSha256,
    docLength: tr.newDoc.length,
    blocks: Object.freeze(nextBlocks),
    lastChangedLogicalIds: Object.freeze(changedLogicalIds),
  });
  return {blocked: false, nextStruct};
}

/** 唯一权威逻辑区间 StateField：只由受控 Effect 或原生 Undo/Redo 同步演进，与 EditorState.doc 同源不可变。 */
export const v3StructureField = StateField.define({
  create() {
    return EMPTY_V3_STRUCTURE;
  },
  update(state, tr) {
    for (const effect of tr.effects) {
      if (effect.is(v3LoadStructureEffect)) {
        return effect.value;
      }
      if (effect.is(v3ApplyOwnedEditEffect)) {
        return effect.value;
      }
    }
    if (tr.docChanged) {
      const res = computeNextStructure(state, tr);
      if (!res.blocked && res.nextStruct) {
        return res.nextStruct;
      }
    }
    return state;
  },
});

/** 依据后端 /markdown 快照构建不可变初始区间状态，并严格核验区间连续性与总长度。 */
export function buildInitialStructureState(snapshot, revision = 1) {
  if (!snapshot || typeof snapshot.markdown !== 'string' || !Array.isArray(snapshot.segments)) {
    throw new Error('无效的 V3 Markdown 快照');
  }
  const docLen = snapshot.markdown.length;
  let cursor = 0;
  const blocks = snapshot.segments.map((seg, idx) => {
    const from = seg.startUtf16;
    const to = seg.endUtf16;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from !== cursor || to < from || to > docLen) {
      throw new Error(`逻辑块区间不连续或越界（index=${idx}）`);
    }
    cursor = to;
    return Object.freeze({
      logicalId: seg.logicalId,
      baseBlockId: seg.baseBlockId,
      parentId: seg.parentId ?? null,
      logicalOrder: seg.logicalOrder,
      blockType: seg.blockType || '',
      p: seg.p,
      b: seg.b,
      s: seg.s,
      rawPath: seg.rawPath ?? null,
      from,
      to,
    });
  });
  if (cursor !== docLen) {
    throw new Error('V3 Markdown 末尾存在未归属字符');
  }
  for (let i = 0; i < blocks.length; i += 1) {
    const minLf = minRequiredLf(blocks, i);
    const tail = snapshot.markdown.slice(Math.max(blocks[i].from, blocks[i].to - minLf), blocks[i].to);
    if (tail !== '\n'.repeat(minLf)) {
      throw new Error(`逻辑块 ${blocks[i].logicalId} 缺少必要的 owned-LF 尾换行`);
    }
  }
  return Object.freeze({
    schema: V3_STRUCTURE_SCHEMA,
    revision,
    structureSha256: snapshot.structureSha256 || '',
    docLength: docLen,
    blocks: Object.freeze(blocks),
  });
}

/** 创建 O(log N) 局部按键级事务门禁。 */
export function createV3OwnedTransactionFilter({onBoundaryBlocked} = {}) {
  return EditorState.transactionFilter.of((tr) => {
    for (const effect of tr.effects) {
      if (effect.is(v3LoadStructureEffect)) {
        return tr;
      }
    }
    if (tr.annotation(v3StructureCommitAnnotation)) {
      return tr;
    }
    if (!tr.docChanged) {
      return tr;
    }

    const prevStruct = tr.startState.field(v3StructureField, false);
    if (!prevStruct) {
      return tr;
    }
    const res = computeNextStructure(prevStruct, tr);
    if (res.unchanged) {
      return tr;
    }
    if (res.blocked) {
      onBoundaryBlocked?.({pos: res.pos, reason: res.reason});
      return [];
    }

    return [
      tr,
      {
        effects: v3ApplyOwnedEditEffect.of(res.nextStruct),
      },
    ];
  });
}
