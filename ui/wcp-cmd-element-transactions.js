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
import {planPDFTextInsertion} from './cmd-pdf-text-insert.js';
import {inspectCMDTextBlocks} from './cmd-text-blocks.js';
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
    const {rows}=await inspectCMDTextBlocks(source);
    if(source!==cmd.readSource())throw Error('拖动期间 CMD 已变化，请重新操作');
    const plan=planCMDBlockMove(source,rows,sourceId,targetId,placement);
    if(!plan.changed)return plan;
    commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
      plan.edits,{source,allowAll:true});
    return {changed:1,sourceId,targetId,placement,pageIndex:plan.pageIndex,shift:plan.shift};
  };
  const port={
    requestMeasure:()=>cmd.requestMeasure(),
    readSource:()=>cmd.readSource(), // read-only CM6 source snapshot; never a second editor
    queryLayout:()=>cmd.queryLayout(),
    queryBlockAnalysis:()=>cmd.queryBlockAnalysis(),
    async setBlockJoin(targetId,join){
      const source=cmd.readSource();
      const {rows}=await inspectCMDTextBlocks(source);
      if(source!==cmd.readSource())throw Error('操作期间 CMD 已发生变化，请重新点击');
      const plan=planCMDBlockJoin(source,rows,targetId,join);
      if(!plan.changed)return plan;
      // The PDF click is explicit user intent; CMD still preflights the
      // exact anchor and forbids edits inside the immutable JSON evidence.
      commit(()=>cmd.replaceRanges(plan.edits,null,[agAllDocumentTransaction.of(true)]),
        plan.edits,{source,allowAll:true});
      return {changed:1,previous:plan.previous,target:plan.target};
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
