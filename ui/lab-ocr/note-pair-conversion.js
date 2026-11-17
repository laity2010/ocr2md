/** WP3.2: pure conversion plan. No database, DOM or CM6 ownership.
 * Every proposed replacement is on the SAME physical MD line. Never
 * infer a candidate or rewrite unreviewed source. Unsupported ambiguity
 * is a hard refusal, not a best-effort textual replacement.
 */
import {projectNoteMatchIndex} from './note-match-index.js';

const fail=message=>{throw Error('注释转换已拒绝：'+message);};
const bodyBuiltin=new Set(['body.md-footnote','body.number-dot','body.number-paren',
  'body.number-bracket','body.labelled','body.symbol','body.letter-dot']);

export function planNotePairConversion({mdRows,blockRows=[],configuration,
  referenceId,bodyId,review}={}){
  if(!Array.isArray(mdRows)||!referenceId||!bodyId||
     review?.decision!=='待转换'||review?.body_id!==bodyId||
     review?.valid!==true)fail('没有有效的人工确认配对');
  const index=projectNoteMatchIndex(mdRows,blockRows,configuration);
  const ref=index.references.find(item=>item.candidate_id===referenceId);
  const body=index.bodies.find(item=>item.candidate_id===bodyId);
  const pair=index.pairs.find(item=>item.reference_id===referenceId);
  if(!ref||!body||!pair?.candidate_body_ids.includes(bodyId)||
     ref.number!==body.number||ref.evidence.scope!==body.evidence.scope)
    fail('注引/注文候选不匹配或已经变更');
  if(!bodyBuiltin.has(body.evidence.rule_id))
    fail('书籍自定义注文格式需先有经测试的转换规则');
  if(!/^(?:[1-9]\d{0,2}|0|[*†‡])$/.test(ref.number))
    fail('暂不转换字母及章节复用注号');
  // Obsidian IDs are global to the MD file. No colliding definition may be
  // silently overwritten, even in another chapter scope.
  if(index.bodies.some(item=>item!==body&&item.number===ref.number&&
     item.candidate_id!==body.candidate_id))
    fail('全文存在相同注号的其他注文，需先解决重复编号');
  const canonical=`[^${ref.number}]`,prefix=canonical+':';
  const ownIds=new Set(body.body_line_ids);
  for(const row of mdRows){
    if(ownIds.has(row.line_id))continue;
    if(row.text.match(new RegExp('^\\s{0,3}\\[\\^'+ref.number.replace(/[†‡*]/g,'\\$&')+'\\]:')))
      fail('全文已经存在同名 Obsidian 注文，拒绝覆盖');
  }
  const rows=new Map(mdRows.map(item=>[item.line_id,item]));
  const source=rows.get(ref.line_id),definition=rows.get(body.line_id);
  if(!source||!definition||ref.block_id!==source.block_id||
     body.block_id!==definition.block_id||
     source.text.slice(ref.from,ref.to)!==ref.raw||
     definition.text.slice(body.from,body.to)!==body.raw||
     review.ref_line_id!==ref.line_id||review.ref_block_id!==ref.block_id||
     review.ref_from!==ref.from||review.ref_to!==ref.to||
     review.ref_raw!==ref.raw||review.ref_source_text!==source.text||
     review.body_line_id!==body.line_id||review.body_block_id!==body.block_id||
     review.body_from!==body.from||review.body_to!==body.to||
     review.body_raw!==body.raw||review.body_source_text!==definition.text)
    fail('确认时的 LineID、BlockID 或原文证据已变化');
  if(source.line_id===definition.line_id)fail('注引与注文位于同一源码行，需人工拆开');
  const updates=new Map();
  const add=(row,after)=>{
    if(typeof after!=='string'||after.includes('\r')||after.includes('\n'))
      fail('转换不得增删物理源码行');
    if(row.text===after)return;
    if(updates.has(row.line_id))fail('存在同一物理行的重叠改写');
    updates.set(row.line_id,Object.freeze({lineId:row.line_id,lineNo:row.line_no,
      blockId:row.block_id,beforeText:row.text,afterText:after}));
  };
  const referenceText=source.text.slice(0,ref.from)+canonical+source.text.slice(ref.to);
  if(ref.evidence.rule_id!=='ref.md-footnote')add(source,referenceText);
  const convertedBody=body.evidence.rule_id!=='body.md-footnote';
  if(convertedBody){
    if(body.from!==0||body.to!==definition.text.length)fail('注文格式没有覆盖完整首行');
    const first=body.content.split('\n')[0];
    if(!first.trim())fail('订单正文为空，拒绝生成空脚注');
    // The parsed first content is the scanner's capture, not a second
    // guessed regex. It must appear verbatim as a suffix in source text.
    if(!definition.text.endsWith(first))fail('注文内容与识别结果不一致');
    add(definition,prefix+' '+first);
    if(body.body_line_ids.length>100)fail('注文过长，需人工检查分段');
    for(const lineId of body.body_line_ids.slice(1)){
      const row=rows.get(lineId);
      if(!row||row.line_no<=definition.line_no||row.line_no>definition.line_no+100)
        fail('注文续行 LineID 不连续');
      if(row.text.trim()&&!/^(?: {2,}|\t)/.test(row.text))
        fail('注文续行没有明确缩进，需人工审阅后再转换');
      if(row.text.trim())add(row,'    '+row.text);
    }
  }
  if(updates.size===0)fail('注引与注文已经是 Obsidian 脚注，无需转换');
  // The scanner may see multiple manually confirmed refs sharing a body.
  // Only the selected reference is edited here, and the definition is
  // updated at most once. Other confirmations must be explicitly rechecked.
  const entries=[...updates.values()].sort((a,b)=>a.lineNo-b.lineNo);
  return Object.freeze({referenceId,bodyId,number:ref.number,
    convertedReferenceId:`ref:${ref.line_id}:${ref.from}:ref.md-footnote`,
    convertedBodyId:`body:${body.line_id}:0:body.md-footnote`,
    marker:canonical,updates:Object.freeze(entries),
    refLineId:ref.line_id,bodyLineId:body.line_id,
    refBeforeText:source.text,refAfterText:referenceText,
    bodyBeforeText:definition.text,
    bodyAfterText:convertedBody?prefix+' '+body.content.split('\n')[0]:definition.text,
    continuationLineIds:Object.freeze([...body.body_line_ids.slice(1)]),
  });
}

/** Combine every safe reference in one physical MD line BEFORE modifying it.
 * The referenced notes' bodies may live on different lines (including a
 * shared body). One immutable plan, one CM6 transaction, one shared SQL CAS
 * receipt per reference. Converted offsets account for preceding replacements.
 */
export function planNotePairGroupConversion({mdRows,blockRows=[],configuration,
  pairs,anchors=[]}={}){
  if(!Array.isArray(pairs)||!Array.isArray(anchors)||pairs.length<1||
     pairs.length>32||pairs.length+anchors.length<2||
     pairs.length+anchors.length>32)
    fail('同一行分组要求至少 2 个注引（含已有转换）');
  const index=projectNoteMatchIndex(mdRows,blockRows,configuration);
  const refs=new Map(index.references.map(item=>[item.candidate_id,item]));
  const lines=new Map(mdRows.map(row=>[row.line_id,row]));
  const originals=[],members=[],seen=new Set(),bodyUpdates=new Map();
  for(const item of pairs){
    if(seen.has(item?.referenceId))fail('同一注引不得重复列入转换组');
    seen.add(item.referenceId);
    const ref=refs.get(item.referenceId);
    if(!ref)fail('分组内注引已变化');
    originals.push(ref);
    const plan=planNotePairConversion({mdRows,blockRows,configuration,...item});
    members.push({referenceId:item.referenceId,bodyId:item.bodyId,
      expectedRevision:item.review.revision,number:plan.number,
      convertedBodyId:plan.convertedBodyId});
    for(const update of plan.updates){
      if(update.lineId===ref.line_id)continue;
      const prior=bodyUpdates.get(update.lineId);
      if(prior&&JSON.stringify(prior)!==JSON.stringify(update))
        fail('多个注文同时修改同一源码行但结果不一致');
      bodyUpdates.set(update.lineId,update);
    }
  }
  const sourceLineId=originals[0].line_id;
  const preserved=[];
  for(const anchor of anchors){
    const saved=anchor?.saved;
    const ref=refs.get(saved?.conversion?.converted_ref_id);
    if(!ref||ref.evidence.rule_id!=='ref.md-footnote'||
       ref.line_id!==sourceLineId||saved.ref_id!==anchor.referenceId||
       !saved.revision||!saved.conversion?.updates?.length||
       saved.convertedLineTexts?.[ref.line_id]!==lines.get(ref.line_id)?.text||
       seen.has(anchor.referenceId))
      fail('已有转换注引的回执与当前原文不一致');
    seen.add(anchor.referenceId);
    preserved.push({referenceId:anchor.referenceId,ref,
      expectedRevision:saved.revision});
  }
  if(originals.some(ref=>ref.line_id!==sourceLineId))
    fail('分组注引必须处于同一物理源码行');
  if(bodyUpdates.has(sourceLineId))fail('同一源码行既是注引又是注文');
  const source=lines.get(sourceLineId);
  if(!source)fail('注引源码行已经消失');
  const sorted=originals.slice().sort((a,b)=>a.from-b.from);
  let end=-1,after='',cursor=0,delta=0;
  for(const ref of sorted){
    if(ref.from<end||ref.from<0||ref.to>source.text.length||
      source.text.slice(ref.from,ref.to)!==ref.raw)
      fail('同一行注引存在重叠或证据已过期');
    after+=source.text.slice(cursor,ref.from);
    const replacement=`[^${ref.number}]`;
    const replacementFrom=ref.from+delta;
    const member=members.find(item=>item.referenceId===ref.candidate_id);
    member.convertedReferenceId=`ref:${ref.line_id}:${replacementFrom}:ref.md-footnote`;
    after+=replacement;cursor=ref.to;end=ref.to;
    delta+=replacement.length-(ref.to-ref.from);
  }
  after+=source.text.slice(cursor);
  const anchorMembers=preserved.map(anchor=>{
    const shift=sorted.filter(ref=>ref.from<anchor.ref.from)
      .reduce((sum,ref)=>sum+`[^${ref.number}]`.length-(ref.to-ref.from),0);
    return {referenceId:anchor.referenceId,
      expectedRevision:anchor.expectedRevision,
      convertedReferenceId:`ref:${sourceLineId}:${anchor.ref.from+shift}:ref.md-footnote`};
  });
  if(after===source.text&&bodyUpdates.size===0)fail('没有需要转换的原文');
  const lineChanges=[];
  if(after!==source.text)lineChanges.push({lineId:source.line_id,
    lineNo:source.line_no,blockId:source.block_id,
    beforeText:source.text,afterText:after});
  lineChanges.push(...bodyUpdates.values());
  lineChanges.sort((a,b)=>a.lineNo-b.lineNo);
  if(new Set(lineChanges.map(x=>x.lineId)).size!==lineChanges.length)
    fail('转换分组出现重复物理行');
  return Object.freeze({number:members.map(x=>x.number).join('、'),
    sourceLineId,updates:Object.freeze(lineChanges.map(x=>Object.freeze(x))),
    members:Object.freeze(members.map(x=>Object.freeze(x))),
    anchors:Object.freeze(anchorMembers.map(x=>Object.freeze(x)))});
}
