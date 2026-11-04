/** WP6 experimental CMD transaction port.
 *
 * Consumers retain their business-owned AG renderers and review planners.
 * Every source write is preflighted against the one authoritative CM6 Text,
 * current virtual chapter [from,to), and immutable MinerU evidence tail.
 * This module NEVER owns source text, creates a file or calls a server.
 *
 * Existing CMD supports single-transaction editAnnotations and replaceRanges;
 * this adapter prevents the silent-success mismatch when a CM6 changeFilter
 * rejects a cross-chapter business edit.
 */
import {createIndexProjector} from './wcp-document-index.js';
import {planCMDBlockJoin,planCMDBlockMove} from './cmd-block-joins.js';
import {planCMDBlockChainArrangement,readCMDBlockChains,parseCMDPBSId,
  planCMDMigrateLegacyBlockChains,projectCMDAtomLocations,planCMDReparentPBS,planCMDJoinP1B3IntoP1B4,planCMDPromotePBSChild,planCMDMergeBlockChains,
  planCMDSplitBlockChain,planCMDMoveBlockChainMember,planCMDExtractBlockChainMember,
  planCMDReorderPBSParents,planCMDReorderPBSChildren,planCMDAbsorbReviewedParent,planCMDInsertPBSParentAt} from './cmd-block-chains.js';
import {planPDFTextInsertion} from './cmd-pdf-text-insert.js';
import {planCMDPDFBBoxEdit} from './cmd-pdf-bbox.js';
import {planCMDSubblockAnnotations,queryCMDLayout} from './cmd-text-blocks.js';
import {agAllDocumentTransaction,currentVirtualChapter} from './wcp-cm-virtual-view.js';
import {SPELL_TAG,readSpellcheckMarks,planSpellcheckMarks} from './cmd-spellcheck.js';
import {LINEBREAK_TAG,readIllegalBreaks,planIllegalBreakMarks} from './cmd-linebreak.js';
import {SENTENCE_TAG,extractTextBlocks,segmentSentences,planSentenceMarks,readSentenceMarks,reconstructSource} from './cmd-sentences.js';

function coordinates(from,to,length){
  return Number.isInteger(from)&&Number.isInteger(to)&&
    from>=0&&to>=from&&to<=length;
}
function operationRanges(operations,source){
  if(!Array.isArray(operations)||!operations.length)
    throw Error('CMD transaction requires operations');
  return operations.map(op=>{
    if(!op||typeof op.action!=='string')throw Error('Invalid CMD operation');
    if(op.action==='insert')return {from:op.at,to:op.at};
    if(op.action==='text')return {from:op.from,to:op.to};
    if(!['remove','update'].includes(op.action)||!op.target)
      throw Error('Invalid CMD annotation target');
    return {
      from:op.target.from-(op.action==='remove'&&op.removeBefore?1:0),
      to:op.target.to+(op.action==='remove'&&op.removeAfter?1:0),
    };
  });
}

export function createCMDTransactionPort(cmd){
  if(!cmd||!cmd.view||typeof cmd.editAnnotations!=='function')
    throw TypeError('Expected live CMDocument');
  const projector=createIndexProjector(()=>cmd.markdown);
  let transactionCount=0;
  const preflight=(ranges,source=cmd.markdown,{allowAll=false}={})=>{
    if(source!==cmd.markdown)throw Error('CMD source snapshot changed; rescan first');
    const scope=currentVirtualChapter(cmd.view.state);
    // CMD index is a derived immutable projection, not a shadow document.
    const immutableFrom=projector.get().bodyEnd;
    for(const {from,to} of ranges){
      if(!coordinates(from,to,source.length))
        throw Error('Invalid CMD source edit range');
      if(from>=immutableFrom||to>immutableFrom)
        throw Error('CMD original MinerU evidence tail is read-only');
      if(scope&&!allowAll&&(from<scope.from||to>scope.to||
        (from===to&&from===scope.to)))
        throw Error('CMD virtual chapter boundary: switch to All or the owning chapter');
    }
  };
  const commit=(run,ranges,{source=cmd.markdown,allowAll=false}={})=>{
    preflight(ranges,source,{allowAll});
    const before=cmd.doc;
    const result=run();
    if(cmd.doc.eq(before))
      throw Error('CMD transaction did not change the CM6 document');
    transactionCount++;
    // The existing CM6 update listener publishes documentRevision; the
    // index lazily rebuilds from that same CM6 state after the transaction.
    return result;
  };
  const moveBlock=async(sourceId,targetId,placement)=>{
    const source=cmd.readSource();
    const current=readCMDBlockChains(source);
    if(current.atoms.some(a=>a.format==='cmd-v1')){
      const plan=planCMDReorderPBSParents(source,sourceId,targetId,placement);
      if(!plan.changed)return plan;
      const edit=plan.edits[0];
      if(source.slice(edit.from,edit.to)!==edit.expected||
        source!==cmd.readSource())throw Error('CMD PBS source changed before reordering');
      const next=source.slice(0,edit.from)+edit.insert+source.slice(edit.to);
      const after=readCMDBlockChains(next);
      const origins=model=>model.atoms.map(a=>a.origin).sort().join('\n');
      const tail=text=>text.slice(text.indexOf('<!-- minerujson:source:v1:'));
      if(after.invalid.length||after.atoms.length!==current.atoms.length||
        origins(after)!==origins(current)||tail(next)!==tail(source))
        throw Error('PBS reorder must preserve every OCR atom and sealed evidence');
      commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
        plan.edits,{source,allowAll:true});
      return plan;
    }
    const {rows}=await cmd.inspectTextBlocks(source);
    if(source!==cmd.readSource())throw Error('拖动期间 CMD 已变化，请重新操作');
    const plan=planCMDBlockMove(source,rows,sourceId,targetId,placement);
    if(!plan.changed)return plan;
    commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
      plan.edits,{source,allowAll:true});
    return {changed:1,sourceId,targetId,placement,pageIndex:plan.pageIndex,shift:plan.shift};
  };
  const commitChainPlan=(plan,expectedSource=null)=>{
    const source=cmd.readSource();
    if(expectedSource!==null&&source!==expectedSource)
      throw Error('CMD BC source snapshot stale; rescan before applying');
    if(!plan.changed)return plan;
    if(!Array.isArray(plan.edits)||plan.changed!==plan.edits.length)
      throw Error('CMD BC plan has inconsistent edit count');
    const before=readCMDBlockChains(source);
    if(before.invalid.length)throw Error('CMD BC source has invalid annotations');
    const byStart=new Map(before.atoms.map(atom=>[atom.from,atom.rawLine]));
    const sorted=[...plan.edits].sort((a,b)=>a.from-b.from);
    let cursor=-1;
    for(const edit of sorted){
      if(!coordinates(edit.from,edit.to,source.length)||edit.from<cursor||
        source.slice(edit.from,edit.to)!==edit.expected||typeof edit.insert!=='string')
        throw Error('CMD BC planned edit is stale or overlaps');
      cursor=edit.to;
      const original=byStart.get(edit.from);
      const isAnchor=original!==undefined&&edit.expected===original&&
        /^\s*(?:>\s*)*<!-- cmd:block:v1 /.test(edit.insert);
      const oldJoin=/^\s*(?:>\s*)*<!-- ocr2md:block-join:v1 [^\n]* -->\n$/.test(edit.expected);
      if(!isAnchor&&!(oldJoin&&edit.insert===''))
        throw Error('CMD BC plan tried to edit non-annotation Markdown');
    }
    const candidate=[...sorted].reverse().reduce((text,edit)=>
      text.slice(0,edit.from)+edit.insert+text.slice(edit.to),source);
    const after=readCMDBlockChains(candidate);
    if(after.invalid.length||after.atoms.length!==before.atoms.length||
      before.atoms.some((atom,i)=>after.atoms[i].id!==atom.id))
      throw Error('CMD BC plan changed PBS identities or broke chain membership');
    const sourceTail=source.indexOf('<!-- minerujson:source:v1:');
    const resultTail=candidate.indexOf('<!-- minerujson:source:v1:');
    if((sourceTail<0)!==(resultTail<0)||
      sourceTail>=0&&source.slice(sourceTail)!==candidate.slice(resultTail))
      throw Error('CMD BC plan altered sealed MinerU evidence');
    commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
      plan.edits,{source,allowAll:true});
    return plan;
  };
  const port={
    requestMeasure:()=>cmd.requestMeasure(),
    readSource:()=>cmd.readSource(), // read-only CM6 source snapshot; never a second editor
    queryLayout:()=>cmd.queryLayout(),
    queryBlockAnalysis:()=>cmd.queryBlockAnalysis(),
    queryBlockChains:()=>cmd.queryBlockChains(),
    // On an explicit CM6 click, carry the CURRENT PBS identity across WCP.
    // A line-only event can otherwise be mistaken for another reordered AG
    // row before the async inventory has caught up.
    blockIdAtSourceLine:line=>{
      if(!Number.isInteger(line)||line<1)return null;
      const loc=projectCMDAtomLocations(cmd.readSource()).find(item=>
        line>=item.sourceLine&&line<=item.scopeEndLine);
      return loc?.id||null;
    },
    arrangeBlockChains:(chains,options={})=>commitChainPlan(
      planCMDBlockChainArrangement(cmd.readSource(),chains),options.expectedSource??null),
    migrateLegacyBlockChains:(options={})=>commitChainPlan(
      planCMDMigrateLegacyBlockChains(cmd.readSource()),options.expectedSource??null),
    mergeBlockChains:(destinationId,sourceId,options={})=>commitChainPlan(
      planCMDMergeBlockChains(cmd.readSource(),destinationId,sourceId),options.expectedSource??null),
    splitBlockChainAt:(memberId,options={})=>commitChainPlan(
      planCMDSplitBlockChain(cmd.readSource(),memberId),options.expectedSource??null),
    extractBlockChainMember:(memberId,options={})=>commitChainPlan(
      planCMDExtractBlockChainMember(cmd.readSource(),memberId),options.expectedSource??null),
    moveBlockChainMember:(memberId,targetId,placement='after',options={})=>commitChainPlan(
      planCMDMoveBlockChainMember(cmd.readSource(),memberId,targetId,placement),
      options.expectedSource??null),
    /** Reorder same-parent direct OCR children as one undoable CMD transaction. */
    reorderPBSChildren(sourceId,targetId,placement='before',options={}){
      const source=cmd.readSource();
      if(options.expectedSource!==undefined&&source!==options.expectedSource)
        throw Error('CMD source changed before child drop; rescan');
      const before=readCMDBlockChains(source);
      const plan=planCMDReorderPBSChildren(source,sourceId,targetId,placement);
      if(!plan.changed)return plan;
      const edits=[...plan.edits].sort((a,b)=>b.from-a.from);
      const candidate=edits.reduce((text,edit)=>{
        if(text.slice(edit.from,edit.to)!==edit.expected)
          throw Error('Stale child reorder edit');
        return text.slice(0,edit.from)+edit.insert+text.slice(edit.to);
      },source);
      const after=readCMDBlockChains(candidate);
      const origins=model=>model.atoms.map(a=>`${a.origin}|${a.role||''}`).sort().join('\n');
      const seal=text=>text.slice(text.indexOf('<!-- minerujson:source:v1:'));
      if(after.invalid.length||before.invalid.length||
        before.atoms.length!==after.atoms.length||
        origins(before)!==origins(after)||seal(source)!==seal(candidate)||
        !after.atoms.some(atom=>atom.id===plan.newId&&
          atom.origin===before.atoms.find(old=>old.id===sourceId)?.origin))
        throw Error('Child reordering must preserve every physical OCR atom');
      commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
        plan.edits,{source,allowAll:true});
      return plan;
    },
    /** Insert independent A immediately BEFORE or AFTER B, one CM6 edit. */
    insertPBSAt(sourceId,targetId,placement='after',options={}){
      const source=cmd.readSource();
      if(options.expectedSource!==undefined&&options.expectedSource!==source)
        throw Error('CMD after-drop source changed; rescan');
      const before=readCMDBlockChains(source);
      const plan=planCMDInsertPBSParentAt(source,sourceId,targetId,placement);
      if(!plan.changed)return plan;
      const result=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
        if(s.slice(e.from,e.to)!==e.expected)throw Error('Stale CMD after-drop edit');
        return s.slice(0,e.from)+e.insert+s.slice(e.to);
      },source);
      const after=readCMDBlockChains(result);
      const current=before.atoms.find(atom=>atom.id===targetId);
      const newTargetId=placement==='before'?
        `p${/^p(\d+)/.exec(targetId)[1]}b${Number(/b(\d+)/.exec(targetId)[1])+1}`:
        targetId;
      const preserved=after.atoms.find(atom=>atom.id===newTargetId);
      const origins=m=>m.atoms.map(atom=>`${atom.origin}|${atom.role||''}`).sort().join('\n');
      if(after.invalid.length||before.invalid.length||
        after.atoms.length!==before.atoms.length||
        origins(after)!==origins(before)||
        !current||preserved?.origin!==current.origin||
        !after.atoms.some(atom=>atom.id===plan.newId&&
          atom.origin===before.atoms.find(old=>old.id===sourceId)?.origin)||
        source.slice(source.indexOf('<!-- minerujson:source:v1:'))!==
          result.slice(result.indexOf('<!-- minerujson:source:v1:')))
        throw Error('Parent insertion must preserve all PDF atoms, target identity and sealed OCR');
      commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
        plan.edits,{source,allowAll:true});
      return plan;
    },
    insertPBSAfter(sourceId,targetId,options={}){
      return this.insertPBSAt(sourceId,targetId,'after',options);
    },
    insertPBSBefore(sourceId,targetId,options={}){
      return this.insertPBSAt(sourceId,targetId,'before',options);
    },
    /** Universal same-page parent absorption: one undoable source edit. */
    absorbPBSParent(sourceId,targetId,options={}){
      const source=cmd.readSource();
      if(options.expectedSource!==undefined&&options.expectedSource!==source)
        throw Error('CMD parent-group snapshot changed; rescan');
      const before=readCMDBlockChains(source);
      const plan=planCMDAbsorbReviewedParent(source,sourceId,targetId);
      const edits=[...plan.edits].sort((a,b)=>b.from-a.from);
      const next=edits.reduce((s,e)=>{
        if(s.slice(e.from,e.to)!==e.expected)throw Error('Source changed during absorption');
        return s.slice(0,e.from)+e.insert+s.slice(e.to);
      },source);
      const after=readCMDBlockChains(next);
      const newOrigins=after.atoms.filter(a=>a.role!=='body').map(a=>a.origin).sort();
      const oldOrigins=before.atoms.filter(a=>a.role!=='body'&&
        // A pure container has no body. Its former physical parent bbox
        // is deliberately replaced by the native child boxes, not moved.
        !(a.id===sourceId&&!newOrigins.includes(a.origin)))
        .map(a=>a.origin).sort();
      const newIds=new Set(after.atoms.map(a=>a.id));
      const oldIds=new Set(before.atoms.map(a=>a.id));
      if(after.invalid.length||before.invalid.length||
        !oldIds.has(sourceId)||newIds.has(sourceId)||!newIds.has(targetId)||
        oldOrigins.join('\n')!==newOrigins.join('\n')||
        source.slice(source.indexOf('<!-- minerujson:source:v1:'))!==
          next.slice(next.indexOf('<!-- minerujson:source:v1:'))||
        !plan.newIds.every(id=>newIds.has(id))||
        after.absorbedParents.length<=before.absorbedParents.length)
        throw Error('CMD join would lose text blocks, alter PDF evidence, or leave old parent');
      commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
        plan.edits,{source,allowAll:true});
      return plan;
    },
    /** Only the specifically reviewed PDF p1b3 -> p1b4 merge is open. */
    joinP1B3IntoP1B4(options={}){
      const source=cmd.readSource();
      if(options.expectedSource!==undefined&&options.expectedSource!==source)
        throw Error('p1b3/p1b4 document changed; rescan before joining');
      const before=readCMDBlockChains(source);
      const plan=planCMDJoinP1B3IntoP1B4(source);
      if(before.invalid.length||!before.atoms.some(a=>a.id==='p1b3'))
        throw Error('Original p1b3 parent missing');
      const next=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,edit)=>{
        if(text.slice(edit.from,edit.to)!==edit.expected)
          throw Error('Source changed while planning join');
        return text.slice(0,edit.from)+edit.insert+text.slice(edit.to);
      },source);
      const after=readCMDBlockChains(next);
      const has=(id,origin,role)=>after.atoms.some(a=>a.id===id&&a.origin===origin&&
        (role===undefined||a.role===role));
      if(after.invalid.length||after.atoms.length!==before.atoms.length||
        after.atoms.some(a=>a.id==='p1b3'||a.id.startsWith('p1b3s'))||
        !has('p1b4','p1b4')||!has('p1b4s0','p1b4','body')||
        !has('p1b4s1','p1b3s0')||
        next.includes('cmd:absorbed-parent:v1 origin="p1b3"')||
        after.absorbedParents.filter(a=>a.origin==='p1b3').length!==1||
        source.slice(source.indexOf('<!-- minerujson:source:v1:'))!==
          next.slice(next.indexOf('<!-- minerujson:source:v1:')))
        throw Error('p1b3 -> p1b4 must preserve all text, layout, and original sealed PDF');
      commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
        plan.edits,{source,allowAll:true});
      return plan;
    },
    reparentPBS(sourceId,targetId,options={}){
      const source=cmd.readSource();
      if(options.expectedSource!==undefined&&source!==options.expectedSource)
        throw Error('CMD PBS reparent snapshot stale');
      const before=readCMDBlockChains(source);
      const plan=planCMDReparentPBS(source,sourceId,targetId);
      if(plan.changed<1||plan.changed>3||plan.edits.length!==plan.changed)
        throw Error('Reparent requires an atomic CMD structural edit');
      const next=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((result,edit)=>{
        if(source.slice(edit.from,edit.to)!==edit.expected)
          throw Error('Reparent expected source changed');
        return result.slice(0,edit.from)+edit.insert+result.slice(edit.to);
      },source);
      const after=readCMDBlockChains(next);
      const origins=model=>[
        ...model.atoms.filter(a=>!(a.role==='body'&&
          parseCMDPBSId(a.origin)?.s.length===0&&
          a.id.endsWith('s0'))).map(a=>a.origin),
        ...(model.absorbedParents||[]).map(a=>a.origin),
      ].sort().join('\n');
      const expectedBody=plan.createdBodyId?after.atoms.find(a=>a.id===plan.createdBodyId):null;
      const nextAtoms=expectedBody?after.atoms.filter(a=>a!==expectedBody):after.atoms;
      const expectedCount=before.atoms.length-(plan.absorbedOrigin?1:0);
      const absorption=plan.absorbedOrigin?after.absorbedParents.find(a=>
        a.origin===plan.absorbedOrigin&&a.target===plan.absorbedTarget):null;
      if(after.invalid.length||expectedCount!==nextAtoms.length||
        origins(before)!==origins(after)||
        (plan.createdBodyId&&(!expectedBody||expectedBody.role!=='body'))||
        (plan.absorbedOrigin&&!absorption)||
        (!plan.absorbedOrigin&&
          (after.atoms.filter(a=>a.origin===plan.origin).length!==1||
           !after.atoms.some(a=>a.id===plan.newId&&a.origin===plan.origin)))||
        (plan.absorbedOrigin&&!after.atoms.some(a=>a.id===plan.newId)))
        throw Error('PBS reparent must retain all original OCR atoms and provenance');
      const tail=text=>text.slice(text.indexOf('<!-- minerujson:source:v1:'));
      if(!next.includes('<!-- minerujson:source:v1:')||tail(next)!==tail(source))
        throw Error('Reparent cannot modify sealed OCR evidence');
      commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
        plan.edits,{source,allowAll:true});
      return plan;
    },
    promotePDFChild(childId,options={}){
      const source=cmd.readSource();
      if(options.expectedSource!==undefined&&source!==options.expectedSource)
        throw Error('PBS child promotion snapshot stale');
      const before=readCMDBlockChains(source);
      const plan=planCMDPromotePBSChild(source,childId);
      if(plan.changed!==2||plan.edits.length!==2)
        throw Error('Promotion requires one atomic CMD scope move');
      const next=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,edit)=>{
        if(source.slice(edit.from,edit.to)!==edit.expected)
          throw Error('Child promotion source was changed');
        return text.slice(0,edit.from)+edit.insert+text.slice(edit.to);
      },source);
      const after=readCMDBlockChains(next);
      const origins=model=>model.atoms.map(a=>a.origin).sort().join('\n');
      if(after.invalid.length||after.atoms.length!==before.atoms.length||
        origins(after)!==origins(before)||
        !after.atoms.some(a=>a.id===plan.newId&&a.origin===plan.origin&&a.kind==='parent'))
        throw Error('Promotion changed sealed OCR atom identity or count');
      const archive=text=>text.slice(text.indexOf('<!-- minerujson:source:v1:'));
      if(!next.includes('<!-- minerujson:source:v1:')||archive(source)!==archive(next))
        throw Error('Promotion cannot modify original OCR archive');
      commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
        plan.edits,{source,allowAll:true});
      return plan;
    },
    async setPDFBBox(memberId,bbox,options={}){
      const source=cmd.readSource();
      if(options.expectedSource!==undefined&&source!==options.expectedSource)
        throw Error('PDF bbox source snapshot stale; rescan before correction');
      // Pure planner consumes original sealed geometry, not an AG/UI bbox.
      const layout=await queryCMDLayout(source);
      if(source!==cmd.readSource())throw Error('PDF bbox source changed during validation');
      // Reparented PBS IDs remain aliases of sealed physical OCR boxes.
      // Persist geometry under the immutable provenance key, never fabricate
      // a child bbox in the original MinerU JSON.
      const identity=readCMDBlockChains(source).atoms.find(a=>a.id===memberId);
      if(!identity)throw Error('Unknown CMD PBS for PDF correction');
      const plan=planCMDPDFBBoxEdit(source,layout,identity.origin,bbox);
      if(!plan.changed)return plan;
      const match=source.indexOf('<!-- minerujson:source:v1:');
      if(match<0||plan.edits.some(e=>e.to>match||e.from>match||
        source.slice(e.from,e.to)!==e.expected))throw Error('PDF bbox plan crosses sealed OCR evidence');
      const candidate=plan.edits.reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),source);
      if(candidate.slice(candidate.indexOf('<!-- minerujson:source:v1:'))!==source.slice(match))
        throw Error('Original sealed OCR evidence changed');
      commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
        plan.edits,{source,allowAll:true});
      return plan;
    },
    async setBlockJoin(targetId,join){
      const source=cmd.readSource();
      const current=readCMDBlockChains(source);
      if(current.invalid.length)throw Error('CMD 块链关系存在无效标签，请先修复');
      if(current.atoms.length&&current.atoms.every(a=>a.format==='cmd-v1')){
        // Compatibility for PDF's existing checked/unchecked parent control.
        // Never emit an old block-join tag into canonical CMD PBS documents.
        const {rows}=await cmd.inspectTextBlocks(source);
        if(source!==cmd.readSource())throw Error('操作期间 CMD 已发生变化，请重新点击');
        const targetIndex=rows.filter(r=>r.anchorCount===1).sort((a,b)=>a.from-b.from)
          .findIndex(row=>row.id===targetId);
        const ordered=rows.filter(r=>r.anchorCount===1).sort((a,b)=>a.from-b.from);
        if(targetIndex<0||targetIndex===0)throw Error('当前 Block 没有前驱 Block');
        const previous=ordered[targetIndex-1].id;
        if(join){
          const plan=commitChainPlan(planCMDMergeBlockChains(source,previous,targetId));
          return {changed:plan.changed?1:0,previous,target:targetId};
        }
        const chain=current.chains.find(x=>x.members.includes(targetId));
        if(!chain||chain.members.indexOf(targetId)===0)
          return {changed:0,previous,target:targetId};
        const plan=commitChainPlan(planCMDSplitBlockChain(source,targetId));
        return {changed:plan.changed?1:0,previous,target:targetId};
      }
      const {rows}=await cmd.inspectTextBlocks(source);
      if(source!==cmd.readSource())throw Error('操作期间 CMD 已发生变化，请重新点击');
      const plan=planCMDBlockJoin(source,rows,targetId,join);
      if(!plan.changed)return plan;
      // The PDF click is explicit user intent; CMD still preflights the
      // exact anchor and forbids edits inside the immutable JSON evidence.
      commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
        plan.edits,{source,allowAll:true});
      return {changed:1,previous:plan.previous,target:plan.target};
    },
    async markOriginalSubblocks(){
      const source=cmd.readSource();
      const plan=await planCMDSubblockAnnotations(source);
      if(source!==cmd.readSource())throw Error('子块扫描期间源码已变化，请重新执行');
      if(!plan.edits.length)return {...plan,changed:0};
      commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
        plan.edits,{source,allowAll:true});
      return {...plan,changed:plan.edits.length};
    },
    moveBlockAfter:(sourceId,afterId)=>moveBlock(sourceId,afterId,'after'),
    moveBlockBefore:(sourceId,beforeId)=>moveBlock(sourceId,beforeId,'before'),
    insertPDFTextAtCaret:(pageIndex,blockIndex,text)=>{
      if(!Number.isInteger(pageIndex)||pageIndex<0||
         !Number.isInteger(blockIndex)||blockIndex<0)
        throw Error('PDF 文本块编号无效');
      // Only the editor owns the caret. A PDF click scrolls the source pane
      // but MUST NOT redirect its selection to the corresponding OCR Block.
      const state=cmd.view.state,caret=state.selection.main.head;
      const source=cmd.readSource();
      const edit=planPDFTextInsertion(source,caret,text);
      commit(()=>cmd.replaceRanges([edit],edit.cursorAfter),[edit],{source});
      return {changed:1,id:`p${pageIndex}b${blockIndex}`,chars:edit.insert.length,
        line:state.doc.lineAt(caret).number};
    },
    queryBlockGeometry:(pageIndex,blockIndex)=>cmd.queryBlockGeometry(pageIndex,blockIndex),
    readLine:n=>cmd.readLine(n),
    lineAtOffset:offset=>cmd.lineAtOffset(offset),
    matchesSnapshot:token=>cmd.matchesSnapshot(token),
    readAnnotations:filter=>cmd.readAnnotations(filter),
    readHtmlElements:()=>cmd.readHtmlElements(),
    getIndex:()=>projector.get(),
    queryElements:filter=>projector.get().queryElements(filter),
    // Semantic CMD spelling elements derive from CM6's current authoritative
    // Markdown and the same CMD HTML annotation parser as other element types.
    querySpellingElements:()=>{
      const source=cmd.markdown,index=projector.get();
      const result=readSpellcheckMarks(source,cmd.readAnnotations({tag:SPELL_TAG}));
      const rows=result.rows.filter(row=>row.from<index.bodyEnd&&row.to<=index.bodyEnd);
      return {rows,stale:result.stale,recordCount:result.recordCount};
    },
    queryIllegalBreakElements:()=>{
      const index=projector.get();
      const result=readIllegalBreaks(cmd.readSource(),cmd.readAnnotations({tag:LINEBREAK_TAG}));
      return {...result,rows:result.rows.filter(row=>row.to<=index.bodyEnd)};
    },
    getLinebreakScanLimit:()=>projector.get().bodyEnd,
    extractTextBlocks:()=>extractTextBlocks(cmd.readSource(),{bodyEnd:projector.get().bodyEnd}),
    querySentences:()=>readSentenceMarks(cmd.readSource(),cmd.readAnnotations({tag:SENTENCE_TAG})),
    segmentSentenceCandidates:()=>{
      const source=cmd.readSource(),projection=extractTextBlocks(source,{bodyEnd:projector.get().bodyEnd});
      if(reconstructSource(projection)!==source)throw Error('CMD 分句无损回组校验失败');
      return segmentSentences(projection);
    },
    getChapter:id=>projector.get().getChapter(id),
    get transactionCount(){return transactionCount;},
    replaceRanges:(edits,cursorAfter=null)=>{
      if(!Array.isArray(edits))throw Error('CMD expected source edits');
      return commit(()=>cmd.replaceRanges(edits,cursorAfter),edits);
    },
    editAnnotations:(ops,options={})=>{
      const agScope=options.agScope??null;
      if(agScope&&(!['all','chapter'].includes(agScope.mode)||
          (agScope.mode==='chapter'&&
            currentVirtualChapter(cmd.view.state)?.id!==agScope.chapterId)))
        throw Error('AG chapter scope changed; rescan before writing');
      const all=agScope?.mode==='all';
      return commit(
        ()=>cmd.editAnnotations(ops,{expectedSource:options.expectedSource,
          annotations:all?[agAllDocumentTransaction.of(true)]:[]}),
        operationRanges(ops,cmd.markdown),
        {source:options.expectedSource??cmd.markdown,allowAll:all});
    },
    // Business module submits only scan candidates + source guard + AG scope.
    // CMD itself identifies existing markers, plans annotations and performs
    // ONE validated CM6 transaction. No AG-owned write plan or second store.
    markSpellingCandidates:(candidates,{expectedSource,agScope}={})=>{
      if(typeof expectedSource!=='string'||cmd.markdown!==expectedSource)
        throw Error('拼写扫描期间源码已变化，请重新扫描');
      if(!Array.isArray(candidates)||candidates.length>800)
        throw Error('拼写候选数量非法或超出 800 项限制');
      if(!agScope||!['all','chapter'].includes(agScope.mode))
        throw Error('拼写标定必须提供明确的 AG 操作范围');
      const index=projector.get();
      let chapter=null;
      if(agScope.mode==='chapter'){
        chapter=index.getChapter(agScope.chapterId);
        const live=currentVirtualChapter(cmd.view.state);
        if(!chapter||!live||live.id!==chapter.id)
          throw Error('拼写章节范围已改变，无法提交标定');
      }
      // Filter to the authorized current chapter and immutable body BEFORE
      // CMD plans or inserts anything. The original MinerU tail is untouchable.
      const eligible=candidates.filter(row=>row&&Number.isInteger(row.from)&&
        Number.isInteger(row.to)&&row.to<=index.bodyEnd&&row.from>=0&&
        (!chapter||(row.from>=chapter.from&&row.to<=chapter.to)));
      const ops=planSpellcheckMarks(expectedSource,eligible,
        cmd.readAnnotations({tag:SPELL_TAG}));
      if(!ops.length)return {changed:0,skipped:candidates.length};
      port.editAnnotations(ops,{expectedSource,agScope});
      return {changed:ops.length,skipped:candidates.length-ops.length};
    },
    markIllegalBreakCandidates:(candidates,{expectedSource,agScope}={})=>{
      if(typeof expectedSource!=='string'||cmd.readSource()!==expectedSource)
        throw Error('断行扫描期间源码已变化，请重新扫描');
      if(!Array.isArray(candidates)||candidates.length>400)
        throw Error('断行候选数量超过 400 项限制');
      if(!agScope||!['all','chapter'].includes(agScope.mode))
        throw Error('非法断行标定必须指定 AG 操作范围');
      const index=projector.get();
      let chapter=null;
      if(agScope.mode==='chapter'){
        chapter=index.getChapter(agScope.chapterId);
        const live=currentVirtualChapter(cmd.view.state);
        if(!chapter||!live||live.id!==chapter.id)
          throw Error('非法断行章节范围已变化');
      }
      const eligible=candidates.filter(row=>row&&Number.isInteger(row.from)&&
        Number.isInteger(row.to)&&row.from>=0&&row.to<=index.bodyEnd&&
        (!chapter||(row.from>=chapter.from&&row.to<=chapter.to)));
      const ops=planIllegalBreakMarks(expectedSource,eligible,
        cmd.readAnnotations({tag:LINEBREAK_TAG}));
      if(!ops.length)return {changed:0,skipped:candidates.length};
      port.editAnnotations(ops,{expectedSource,agScope});
      return {changed:ops.length,skipped:candidates.length-ops.length};
    },
    markSentences:(sentences,{expectedSource,agScope}={})=>{
      if(typeof expectedSource!=='string'||expectedSource!==cmd.readSource())
        throw Error('分句过程中源码已变化，请重新扫描');
      if(!Array.isArray(sentences)||sentences.length>3000)
        throw Error('分句结果超出一次标定上限（3000 句）');
      if(!agScope||!['all','chapter'].includes(agScope.mode))throw Error('必须指定分句标定范围');
      const index=projector.get();let chapter=null;
      if(agScope.mode==='chapter'){
        chapter=index.getChapter(agScope.chapterId);
        if(!chapter||currentVirtualChapter(cmd.view.state)?.id!==chapter.id)
          throw Error('分句章节范围已改变');
      }
      const eligible=sentences.filter(sentence=>sentence.fragments?.length&&
        sentence.fragments.every(f=>f.from>=0&&f.to<=index.bodyEnd&&
          (!chapter||(f.from>=chapter.from&&f.to<=chapter.to))));
      const ops=planSentenceMarks(expectedSource,eligible,
        cmd.readAnnotations({tag:SENTENCE_TAG}));
      if(!ops.length)return {changed:0,skipped:sentences.length};
      port.editAnnotations(ops,{expectedSource,agScope});
      return {changed:ops.length,skipped:sentences.length-eligible.length};
    },
    writeAnnotation:options=>{
      if(!options)throw Error('Missing annotation action');
      const target=options.target;
      if(target===null||target===undefined){
        const at=options.at;
        return commit(()=>cmd.writeAnnotation(options),[{from:at,to:at}]);
      }
      return commit(()=>cmd.writeAnnotation(options),[{from:target.from,to:target.to}]);
    },
    writeHtml:options=>{
      const doc=cmd.doc;
      if(!options||!Number.isInteger(options.beforeLine)||
         options.beforeLine<1||options.beforeLine>doc.lines)
        throw Error('Invalid HTML destination line');
      const line=doc.line(options.replaceLine??options.beforeLine);
      return commit(()=>cmd.writeHtml(options),[{from:line.from,
        to:options.replaceLine!==null&&options.replaceLine!==undefined?line.to:line.from}]);
    },
    // Explicit, atomic way for media actions to submit URL replacements after
    // an asynchronous fetch while ensuring the result is still an indexed
    // media reference (not an arbitrary matching string in another chapter).
    replaceMediaReferences(edits,actionScope){
      if(!Array.isArray(edits)||!edits.length)
        throw Error('Media replacement requires source ranges');
      if(!actionScope||!['all','chapter'].includes(actionScope.mode)||
          (actionScope.mode==='chapter'&&typeof actionScope.chapterId!=='string'))
        throw Error('Media AG operation scope required');
      const index=projector.get();
      const media=index.queryElements({type:'media'});
      const available=new Set(media.map(item=>String(item.from)+':'+String(item.to)));
      for(const edit of edits){
        if(!available.has(edit.from+':'+edit.to))
          throw Error('Media element moved or changed; rescan before writing');
      }
      const scope=currentVirtualChapter(cmd.view.state);
      if(actionScope.mode==='chapter'&&
        (!scope||scope.id!==actionScope.chapterId||!index.getChapter(actionScope.chapterId)))
        throw Error('Selected AG chapter no longer matches CMD view');
      const selected=actionScope.mode==='chapter'
        ?new Set(media.filter(row=>row.chapterId===actionScope.chapterId)
          .map(row=>String(row.from)+':'+String(row.to))):null;
      const writable=selected?edits.filter(edit=>selected.has(edit.from+':'+edit.to)):edits;
      if(!writable.length)return {changed:0,skipped:edits.length};
      const all=actionScope.mode==='all';
      const result=commit(()=>cmd.replaceRanges(writable,null,
        all?[agAllDocumentTransaction.of(true)]:[]),writable,{allowAll:all});
      return {changed:result.changed,skipped:edits.length-writable.length};
    },
  };
  return Object.freeze(port);
}
