/** Pure AG/CMD contract: a suspected break is a relation A -> B, not a
 * second source document. A within-child scar is explicitly A -> A and must
 * NOT pretend that two separate OCR blocks exist. */
const pbs=/^p\d+b\d+(?:s\d+)?$/;
export function projectIllegalBreakPair(row){
  const id=row?.blockId;
  if(typeof id!=='string'||!pbs.test(id))return {beforeBlockId:null,afterBlockId:null,pairKind:'未映射'};
  const sibling=typeof row.nextBlockId==='string'&&pbs.test(row.nextBlockId);
  const previous=typeof row.previousBlockId==='string'&&pbs.test(row.previousBlockId);
  const beforeBlockId=sibling?id:(previous?row.previousBlockId:id);
  const afterBlockId=sibling?row.nextBlockId:id;
  return {beforeBlockId,afterBlockId,pairKind:beforeBlockId===afterBlockId?'块内':'跨块'};
}
