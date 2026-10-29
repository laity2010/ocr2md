/** Syntax-aware, read-only HTML locator over the canonical Markdown source.
 * Code fences, inline code, escapes, and comment payloads are not HTML.
 * @codemirror/lang-markdown shares the Markdown Lezer grammar with CMD.
 */
import {markdownLanguage} from '@codemirror/lang-markdown';
const NAME=/^[A-Za-z][A-Za-z0-9:._-]*/;

function* tokens(source,from,to){
  let i=from;
  while(i<to){
    const start=source.indexOf('<',i);
    if(start<0||start>=to)break;
    if(source.startsWith('<!--',start)){
      const end=source.indexOf('-->',start+4);
      if(end<0||end+3>to){i=start+4;continue;}
      yield {from:start,to:end+3,kind:'注释',tag:'<!-- -->'};
      i=end+3;continue;
    }
    // Reject doctype/processing declarations and mathematical comparisons:
    // the table contains HTML elements and HTML comments only.
    const rest=source.slice(start+1,Math.min(to,start+130));
    const slash=rest.startsWith('/');
    const name=NAME.exec(rest.slice(slash?1:0));
    if(!name){i=start+1;continue;}
    const tag=name[0];
    const next=source[start+1+(slash?1:0)+tag.length];
    if(next&&!/[\s/>]/.test(next)){i=start+1;continue;}
    let quote=null,end=-1;
    for(let j=start+1;j<to;j++){
      const c=source[j];
      if(quote){if(c===quote)quote=null;continue;}
      if(c==='"'||c==="'"){quote=c;continue;}
      if(c==='<')break;
      if(c==='>'){end=j+1;break;}
    }
    if(end<0){i=start+1;continue;}
    yield {from:start,to:end,tag:tag.toLowerCase(),kind:slash?'结束标签':/\/\s*>$/.test(source.slice(start,end))?'自闭合':'开始标签'};
    i=end;
  }
}
export function scanHtmlElements(source){
  if(typeof source!=='string')throw TypeError('Expected Markdown source');
  const result=[],seen=new Set();
  const tree=markdownLanguage.parser.parse(source);
  tree.iterate({enter(node){
    if(!['HTMLTag','HTMLBlock','CommentBlock'].includes(node.name))return;
    for(const item of tokens(source,node.from,node.to)){
      const key=item.from+':'+item.to;
      if(seen.has(key))continue;
      seen.add(key);
      result.push(Object.freeze({...item,raw:source.slice(item.from,Math.min(item.to,item.from+180))}));
    }
  }});
  return Object.freeze(result.sort((a,b)=>a.from-b.from||a.to-b.to));
}
