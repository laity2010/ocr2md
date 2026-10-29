/** Source action's pure Markdown insertion planner (no CM6 state, no write). */
export const CHOICES=Object.freeze([
  {mode:'collapsed',label:'插入 Callout · 默认隐藏',mark:'-'},
  {mode:'expanded',label:'插入 Callout · 默认展开',mark:'+'},
  {mode:'fixed',label:'插入 Callout · 常显',mark:''},
]);

/** Pure source planner, no edits or implicit save. Preserve all old bytes. */
export function planCalloutAtCursor(doc,offset,mode='collapsed'){
  if(typeof doc!=='string'||!Number.isInteger(offset)||offset<0||offset>doc.length)
    throw Error('无效的源码光标位置');
  const choice=CHOICES.find(item=>item.mode===mode);
  if(!choice)throw Error('未知 Callout 类型');
  const before=doc.slice(0,offset),after=doc.slice(offset);
  // Full blank-line boundaries make the inserted block valid Markdown even
  // when the cursor is in the middle of an ordinary source paragraph.
  const prefix=before.length===0?'':before.endsWith('\n\n')?'':before.endsWith('\n')?'\n':'\n\n';
  const suffix=after.length===0?'\n':after.startsWith('\n\n')?'':after.startsWith('\n')?'\n':'\n\n';
  const text=`> [!note]${choice.mark} 标题\n> 内容`;
  const insert=prefix+text+suffix;
  const cursorAfter=offset+prefix.length+text.indexOf('内容');
  return Object.freeze({from:offset,to:offset,expected:'',insert,cursorAfter});
}

