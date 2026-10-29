/** Pure Markdown fenced-code block insertion planner. Layout owns the menu;
 * CMD remains the only Markdown writer and validates evidence/chapter scope.
 */
const fenceFor=body=>{
  let longest=0;
  for(const match of body.matchAll(/`+/g))longest=Math.max(longest,match[0].length);
  return '`'.repeat(Math.max(3,longest+1));
};
const blankBefore=before=>!before?'':before.endsWith('\n\n')?'':
  before.endsWith('\n')?'\n':'\n\n';
const blankAfter=after=>!after?'\n':after.startsWith('\n\n')?'':
  after.startsWith('\n')?'\n':'\n\n';

/** Expand non-empty selections to complete source lines so neither fence
 * can end up embedded within a paragraph. An empty caret inserts a blank
 * fenced block at that exact offset. All source outside the edit is intact.
 */
export function planFencedBlock(doc,from,to=from){
  if(typeof doc!=='string'||!Number.isInteger(from)||!Number.isInteger(to)||
     from<0||to<from||to>doc.length)
    throw Error('无效的源码选区');
  let start=from,end=to;
  if(to>from){
    start=doc.lastIndexOf('\n',from-1)+1;
    const last=to-1;
    const newline=doc.indexOf('\n',last);
    end=newline===-1?doc.length:newline;
  }
  const before=doc.slice(0,start),after=doc.slice(end),body=doc.slice(start,end);
  const fence=fenceFor(body);
  const prefix=blankBefore(before),suffix=blankAfter(after);
  const insert=prefix+fence+'\n'+body+'\n'+fence+suffix;
  const cursorAfter=start+prefix.length+fence.length+1;
  return Object.freeze({from:start,to:end,expected:body,insert,cursorAfter});
}
