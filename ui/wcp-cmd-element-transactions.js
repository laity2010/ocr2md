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
import {agAllDocumentTransaction,currentVirtualChapter} from './wcp-cm-virtual-view.js';
import {SPELL_TAG,readSpellcheckMarks,planSpellcheckMarks} from './cmd-spellcheck.js';

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
  const port={
    requestMeasure:()=>cmd.requestMeasure(),
    readSource:()=>cmd.readSource(), // read-only CM6 source snapshot; never a second editor
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
