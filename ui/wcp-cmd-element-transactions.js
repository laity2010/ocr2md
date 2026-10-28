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
import {currentVirtualChapter} from './wcp-cm-virtual-view.js';

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
  const preflight=(ranges,source=cmd.markdown)=>{
    if(source!==cmd.markdown)throw Error('CMD source snapshot changed; rescan first');
    const scope=currentVirtualChapter(cmd.view.state);
    // CMD index is a derived immutable projection, not a shadow document.
    const immutableFrom=projector.get().bodyEnd;
    for(const {from,to} of ranges){
      if(!coordinates(from,to,source.length))
        throw Error('Invalid CMD source edit range');
      if(from>=immutableFrom||to>immutableFrom)
        throw Error('CMD original MinerU evidence tail is read-only');
      if(scope&&(from<scope.from||to>scope.to||
        (from===to&&from===scope.to)))
        throw Error('CMD virtual chapter boundary: switch to All or the owning chapter');
    }
  };
  const commit=(run,ranges,{source=cmd.markdown}={})=>{
    preflight(ranges,source);
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
    readLine:n=>cmd.readLine(n),
    lineAtOffset:offset=>cmd.lineAtOffset(offset),
    matchesSnapshot:token=>cmd.matchesSnapshot(token),
    readAnnotations:filter=>cmd.readAnnotations(filter),
    getIndex:()=>projector.get(),
    queryElements:filter=>projector.get().queryElements(filter),
    getChapter:id=>projector.get().getChapter(id),
    get transactionCount(){return transactionCount;},
    replaceRanges:(edits,cursorAfter=null)=>{
      if(!Array.isArray(edits))throw Error('CMD expected source edits');
      return commit(()=>cmd.replaceRanges(edits,cursorAfter),edits);
    },
    editAnnotations:(ops,options={})=>commit(
      ()=>cmd.editAnnotations(ops,options),
      operationRanges(ops,cmd.markdown),
      {source:options.expectedSource??cmd.markdown}),
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
    replaceMediaReferences(edits){
      if(!Array.isArray(edits)||!edits.length)
        throw Error('Media replacement requires source ranges');
      const index=projector.get();
      const available=new Set(index.queryElements({type:'media'})
        .map(item=>String(item.from)+':'+String(item.to)));
      for(const edit of edits){
        if(!available.has(edit.from+':'+edit.to))
          throw Error('Media element moved or changed; rescan before writing');
      }
      // The active virtual chapter is a CMD write boundary, not a Media
      // download boundary. Accept only authorized in-chapter references;
      // outside links remain unchanged and the fetched image stays on disk.
      const scope=currentVirtualChapter(cmd.view.state);
      const writable=scope?edits.filter(edit=>edit.from>=scope.from&&edit.to<=scope.to):edits;
      if(!writable.length)return {changed:0,skipped:edits.length};
      const result=port.replaceRanges(writable);
      return {changed:result.changed,skipped:edits.length-writable.length};
    },
  };
  return Object.freeze(port);
}
