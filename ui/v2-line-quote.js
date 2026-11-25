/** Physical half-open selection, scoped to the current owned MD Line revision. */
export function captureLineSelection(doc,index,selection){
 const {from,to}=selection;
 const first=doc.lineAt(from).number,last=doc.lineAt(to>from?to-1:to).number;
 const rows=index?.rows.filter(r=>r.source_line>=first&&r.source_line<=last)??[];
 return Object.freeze({first,last,count:last-first+1,revision:index?.revision??null,
   refs:Object.freeze(rows.map(r=>index.makeRef(r.source_line)))});
}
/** Prefix-only changes: preserve all other characters, LF and ownership. */
export function quoteLineChanges(index,range,mode){
 if(!index||!range?.revision||range.revision!==index.revision||!['add','remove'].includes(mode))throw Error('选区已失效，请重新选择');
 const changes=[];
 for(const ref of range.refs){
  const row=index.resolve(ref);if(!row)throw Error('选区行已变化');
  if(mode==='add')changes.push({from:row.from,to:row.from,insert:'>'});
  else if(row.md_line.startsWith('>'))changes.push({from:row.from,to:row.from+1,insert:''});
 }
 return changes;
}
