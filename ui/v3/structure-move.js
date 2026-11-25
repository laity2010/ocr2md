/** WP05 · 局部 ChangeSpec 结构拖拽归组规划器（CM.md 第 5 节）。
 *
 * 严格遵循：
 * 1. 绝不使用 {from: 0, to: doc.length} 全文替换；
 * 2. 拆解为源区间删除、目标区间插入与受影响边界空行修正的局部 ChangeSpec[]；
 * 3. 两层 PBS（s0 父组 / s>=1 直系子块，禁止孙块），同级槽位顺延，保留空号；
 * 4. 仅在同组相邻后继关系发生变化时按 owned-LF 规则调整尾换行，保留已有块内空行。
 */
import {V3_STRUCTURE_SCHEMA, minRequiredLf} from './cm-structure.js';

function cloneGroup(blocks, target) {
  return blocks.filter((b) => b.p === target.p && b.b === target.b);
}

function adjustTailForBoundary(text, sameGroupNext, wasSameGroupNext) {
  if (sameGroupNext === wasSameGroupNext) {
    return text;
  }
  if (sameGroupNext) {
    // 变成同组紧邻前驱时，尾换行规整为单 \n（消除多余组间空行）
    return text.replace(/\n+$/, '\n');
  }
  // 变成独立组末时，确保至少 2 个 \n
  if (text.endsWith('\n\n')) return text;
  return text.endsWith('\n') ? text + '\n' : text + '\n\n';
}

/** 规划局部结构移动：返回 { unchanged, changes (CM6 ChangeSpec[]), nextStruct, movedIds }。 */
export function planLocalStructureMove(doc, prevStruct, intent) {
  const blocks = prevStruct?.blocks;
  if (!doc || !Array.isArray(blocks) || blocks.length === 0) {
    throw new Error('文档尚未加载逻辑块，无法移动结构');
  }
  const {sourceBlockId, targetBlockId, placement} = intent || {};
  if (!['before', 'after', 'child'].includes(placement)) {
    throw new Error('未知的 PBS 拖放落点');
  }

  const byId = new Map(blocks.map((b) => [b.logicalId, b]));
  const src = byId.get(Number(sourceBlockId));
  const dst = byId.get(Number(targetBlockId));
  if (!src || !dst || src === dst) {
    throw new Error('拖动来源或目标逻辑块无效');
  }

  const rootFor = (r) => blocks.find((x) => x.p === r.p && x.b === r.b && x.s === 0);
  const srcRoot = rootFor(src);
  const dstRoot = rootFor(dst);
  if (!srcRoot || !dstRoot) {
    throw new Error('PBS 父块分组缺少 s0 根锚点');
  }
  const sameGroup = src.p === dst.p && src.b === dst.b;

  let moved = [];
  let remaining = [];
  let insertAt = 0;
  let newMembers = [];

  if (placement === 'child') {
    if (src.s !== 0 || sameGroup) {
      throw new Error('只能将独立父块组归入其他父块组，禁止制造孙块');
    }
    moved = cloneGroup(blocks, src);
    const slot = dst.s + 1;
    remaining = blocks
      .filter((r) => !moved.includes(r))
      .map((r) => (r.p === dst.p && r.b === dst.b && r.s >= slot ? {...r, s: r.s + moved.length} : {...r}));
    insertAt = remaining.findIndex((r) => r.logicalId === dst.logicalId) + 1;
    newMembers = moved.map((r, i) => ({
      ...r,
      p: dst.p,
      b: dst.b,
      s: slot + i,
      parentId: dstRoot.logicalId,
    }));
  } else if (src.s === 0 && dst.s === 0 && !sameGroup) {
    moved = cloneGroup(blocks, src);
    const slot = dst.b + (placement === 'after' ? 1 : 0);
    remaining = blocks
      .filter((r) => !moved.includes(r))
      .map((r) => (r.p === dst.p && r.b >= slot ? {...r, b: r.b + 1} : {...r}));
    const at = remaining.findIndex((r) => r.logicalId === dstRoot.logicalId);
    let end = at + 1;
    while (end < remaining.length && remaining[end].parentId === dstRoot.logicalId) {
      end += 1;
    }
    insertAt = placement === 'before' ? at : end;
    newMembers = moved.map((r) => ({...r, p: dst.p, b: slot}));
  } else if (src.s > 0 && dst.s > 0 && sameGroup) {
    moved = [src];
    const slot = dst.s + (placement === 'after' ? 1 : 0);
    remaining = blocks
      .filter((r) => r !== src)
      .map((r) => (r.p === dst.p && r.b === dst.b && r.s >= slot ? {...r, s: r.s + 1} : {...r}));
    const at = remaining.findIndex((r) => r.logicalId === dst.logicalId);
    insertAt = at + (placement === 'after' ? 1 : 0);
    newMembers = [{...src, s: slot}];
  } else {
    throw new Error('该层级的拖动落点不受支持');
  }

  const reordered = [
    ...remaining.slice(0, insertAt),
    ...newMembers,
    ...remaining.slice(insertAt),
  ].map((r, idx) => ({...r, logicalOrder: idx + 1}));

  // 校验是否已是完全正确的序列与同级编号（避免误判旧乱序为无操作，也避免对已在目标一侧的紧邻块无意义腾槽）
  const seqSame = reordered.every((r, i) => r.logicalId === blocks[i].logicalId);
  const numberedSame = reordered.every(
    (r, i) => r.p === blocks[i].p && r.b === blocks[i].b && r.s === blocks[i].s && r.parentId === blocks[i].parentId,
  );
  const alreadyInOrder =
    src.s === 0
      ? src.p === dst.p && (placement === 'before' ? src.b < dst.b : src.b > dst.b)
      : sameGroup && (placement === 'before' ? src.s < dst.s : src.s > dst.s);
  if ((seqSame && numberedSame) || (seqSame && placement !== 'child' && alreadyInOrder)) {
    return {unchanged: true, changes: [], nextStruct: prevStruct};
  }

  // 计算旧/新同组紧邻后继，确定局部尾换行需要微调的块
  const oldSameSucc = new Map();
  for (let i = 0; i < blocks.length; i += 1) {
    const nxt = i + 1 < blocks.length ? blocks[i + 1] : null;
    oldSameSucc.set(blocks[i].logicalId, Boolean(nxt && nxt.p === blocks[i].p && nxt.b === blocks[i].b));
  }
  const newSameSucc = new Map();
  for (let i = 0; i < reordered.length; i += 1) {
    const nxt = i + 1 < reordered.length ? reordered[i + 1] : null;
    newSameSucc.set(reordered[i].logicalId, Boolean(nxt && nxt.p === reordered[i].p && nxt.b === reordered[i].b));
  }

  const movedIdSet = new Set(moved.map((m) => m.logicalId));
  const srcFirst = moved[0];
  const srcLast = moved[moved.length - 1];
  const srcFrom = srcFirst.from;
  const srcTo = srcLast.to;

  // 计算目标插入点在旧文档中的 UTF-16 坐标
  let insertOldPos = 0;
  if (insertAt === 0) {
    insertOldPos = 0;
  } else {
    const prevRemaining = reordered[insertAt - 1];
    insertOldPos = byId.get(prevRemaining.logicalId).to;
  }

  const localSpecs = [];
  const nextLenById = new Map();

  if (seqSame) {
    // 物理顺序未变（如仅修正 PBS 编号或原地归入前一块为 child）：不移动块文本，仅保留边界块微调
    for (const item of moved) {
      const orig = byId.get(item.logicalId);
      nextLenById.set(item.logicalId, orig.to - orig.from);
    }
  } else {
    // 组装被移动块组的新文本（仅在组内/组末角色变化时微调每个块的尾换行）
    const movedPieces = [];
    for (const item of newMembers) {
      const orig = byId.get(item.logicalId);
      const rawText = doc.sliceString(orig.from, orig.to);
      const adjusted = adjustTailForBoundary(
        rawText,
        newSameSucc.get(item.logicalId),
        oldSameSucc.get(item.logicalId),
      );
      movedPieces.push(adjusted);
      nextLenById.set(item.logicalId, adjusted.length);
    }
    localSpecs.push(
      {from: srcFrom, to: srcTo, insert: ''},
      {from: insertOldPos, to: insertOldPos, insert: movedPieces.join('')},
    );
  }

  // 对未移动（或物理顺序未变）但同组后继发生改变的边界块，追加局部尾换行微调 ChangeSpec
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    if (!seqSame && movedIdSet.has(b.logicalId)) continue;
    const wasInside = oldSameSucc.get(b.logicalId);
    const nowInside = newSameSucc.get(b.logicalId);
    if (wasInside === nowInside) {
      nextLenById.set(b.logicalId, b.to - b.from);
      continue;
    }
    const rawText = doc.sliceString(b.from, b.to);
    const adjusted = adjustTailForBoundary(rawText, nowInside, wasInside);
    nextLenById.set(b.logicalId, adjusted.length);
    if (adjusted !== rawText) {
      const bodyLen = rawText.replace(/\n+$/, '').length;
      const tailFrom = b.from + bodyLen;
      const newTail = adjusted.slice(bodyLen);
      localSpecs.push({from: tailFrom, to: b.to, insert: newTail});
    }
  }

  // 按旧文档区间起止严格升序排列，并合并共享端点（如 tailFrom..b.to 与 b.to..b.to）防止 CM6 ChangeSet 报重叠异常
  localSpecs.sort((a, b) => (a.from !== b.from ? a.from - b.from : a.to - b.to));
  const mergedSpecs = [];
  for (const spec of localSpecs) {
    const prev = mergedSpecs[mergedSpecs.length - 1];
    if (prev && spec.from <= prev.to) {
      prev.to = Math.max(prev.to, spec.to);
      prev.insert += spec.insert;
    } else {
      mergedSpecs.push({...spec});
    }
  }

  // 计算移动后精确的新 [from, to) 区间
  let cursor = 0;
  const nextBlocks = reordered.map((r) => {
    const len = nextLenById.get(r.logicalId);
    const from = cursor;
    const to = cursor + len;
    cursor = to;
    return Object.freeze({...r, from, to});
  });

  // 校验新序列满足 owned-LF 最小换行要求
  for (let i = 0; i < nextBlocks.length; i += 1) {
    const minLf = minRequiredLf(nextBlocks, i);
    if (nextBlocks[i].to - nextBlocks[i].from < minLf) {
      throw new Error(`局部移动后逻辑块 ${nextBlocks[i].logicalId} 长度不足以容纳尾换行`);
    }
  }

  const nextStruct = Object.freeze({
    schema: V3_STRUCTURE_SCHEMA,
    revision: prevStruct.revision + 1,
    structureSha256: prevStruct.structureSha256,
    docLength: cursor,
    blocks: Object.freeze(nextBlocks),
  });

  return {
    unchanged: false,
    changes: mergedSpecs,
    nextStruct,
  };
}
