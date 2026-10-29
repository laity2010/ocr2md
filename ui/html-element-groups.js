/** AG-owned read-only projection: one row per standalone HTML token or
 * balanced opening/closing pair. CMD retains its original token positions.
 * Malformed pairs remain visible instead of guessing an invalid match.
 */
const VOID_TAGS=new Set([
  'area','base','br','col','embed','hr','img','input','link','meta',
  'param','source','track','wbr',
]);

export function groupHtmlElements(tokens){
  if(!Array.isArray(tokens))throw TypeError('Expected CMD HTML element tokens');
  const result=[],stack=[];
  for(const token of tokens){
    if(!token||!Number.isInteger(token.from)||!Number.isInteger(token.to)||
       !Number.isInteger(token.line)||token.from<0||token.to<=token.from)
      throw TypeError('Invalid CMD HTML element token');
    const single=token.kind==='注释'||token.kind==='自闭合'||VOID_TAGS.has(token.tag);
    if(single){
      result.push({from:token.from,to:token.to,tag:token.tag,kind:'单行',
        openLine:token.line,closeLine:null,openRaw:token.raw,closeRaw:'',status:'完整'});
    }else if(token.kind==='开始标签'){
      const row={from:token.from,to:token.to,tag:token.tag,kind:'开合',
        openLine:token.line,closeLine:null,openRaw:token.raw,closeRaw:'',status:'缺结束标签'};
      result.push(row);
      stack.push(row);
    }else if(token.kind==='结束标签'){
      const top=stack.at(-1);
      if(top?.tag===token.tag){
        stack.pop();
        top.to=token.to;
        top.closeLine=token.line;
        top.closeRaw=token.raw;
        top.status='完整';
      }else{
        // Never match across an unclosed child tag: crossing pairs are not
        // structurally valid HTML. Keep every orphan closing token visible.
        result.push({from:token.from,to:token.to,tag:token.tag,kind:'开合',
          openLine:null,closeLine:token.line,openRaw:'',closeRaw:token.raw,
          status:'缺开始标签'});
      }
    }else throw TypeError('Unknown CMD HTML token kind: '+token.kind);
  }
  return Object.freeze(result.map(row=>Object.freeze(row)));
}
