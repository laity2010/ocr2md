/** Pure, conservative OCR HTML-table projection for published Obsidian MD.
 * No DOM, networking or file writes. Suspicious/unsupported HTML remains in
 * its original inert fence for human review, never silently gets stripped.
 */
const TAGS=new Set(['table','caption','colgroup','col','thead','tbody','tfoot','tr','th','td','p','span','br','b','strong','i','em','s','u','small','sup','sub','code','eq']);
const VOID=new Set(['col','br']);
const PARENTS=new Set(['table','colgroup','thead','tbody','tfoot','tr','td','th','caption','p','span']);
const escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/** Return null if unsupported/malformed: the caller must keep inert source. */
export function safeObsidianHtmlTable(source:string):string|null{
  const raw=source.trim();
  if(!/^<table(?:\s[^>]*)?>[\s\S]*<\/table>$/i.test(raw)||raw.length>500_000)return null;
  const tokens=raw.match(/<!--[^]*?-->|<[^>]*>|[^<]+/g);
  if(!tokens||tokens.join('')!==raw)return null;
  const stack:string[]=[],result:string[]=[];
  let cells=0;
  for(const token of tokens){
    if(token.startsWith('<!--'))return null;
    if(!token.startsWith('<')){
      // Keep valid HTML entities from MinerU but forbid accidental HTML
      // injection through unescaped angular brackets.
      if(token.includes('>'))result.push(escape(token));
      else result.push(token.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z]+);)/gi,'&amp;'));
      continue;
    }
    const match=/^<\s*(\/?)\s*([a-z][\w-]*)([^>]*)>$/i.exec(token);
    if(!match)return null;
    const close=!!match[1],name=match[2].toLowerCase(),tail=match[3];
    if(!TAGS.has(name)||/\s*\/\s*>$/.test(token)&&!VOID.has(name))return null;
    if(close){
      if(tail.trim()||stack.pop()!==name)return null;
      result.push(name==='eq'?'</code>':`</${name}>`);continue;
    }
    let attrs='';
    if(tail.trim() && !/^\s*\/?\s*$/.test(tail)){
      if(!['td','th','col','colgroup'].includes(name))return null;
      const at=tail.trim();
      const fragments=at.match(/\b(?:rowspan|colspan|scope|align)\s*=\s*(?:"[^"]*"|'[^']*'|\d+)/gi);
      if(!fragments||fragments.join('').replace(/\s/g,'')!==at.replace(/\s/g,''))return null;
      const seen=new Set<string>();
      for(const value of fragments){
        const attr=/^(rowspan|colspan|scope|align)\s*=\s*(.*)$/i.exec(value)!;
        const key=attr[1].toLowerCase(),v=attr[2].replace(/^["']|["']$/g,'');
        if(seen.has(key))return null;seen.add(key);
        if(key==='rowspan'||key==='colspan'){
          if(!/^\d{1,3}$/.test(v)||+v<1||+v>100)return null;
        }else if(key==='scope'&&!['row','col','rowgroup','colgroup'].includes(v.toLowerCase()))return null;
        else if(key==='align'&&!['left','right','center'].includes(v.toLowerCase()))return null;
        attrs+=` ${key}="${escape(v)}"`;
      }
    }
    if(stack.includes('eq'))return null;
    if(name==='eq'&&!['td','th'].includes(stack.at(-1)??''))return null;
    if(name==='table'&&stack.length)return null;
    if(name==='tr'&&!stack.some(t=>['table','tbody','thead','tfoot'].includes(t)))return null;
    if(['td','th'].includes(name)){
      if(stack.at(-1)!=='tr')return null;
      cells++;
    }
    if(!PARENTS.has(name)&&stack.length===0)return null;
    // MinerU's <eq> is NOT standard HTML. Keep the exact editable TeX in a
    // familiar Obsidian code span, mark it for LaTeX cleaning, and never drop it.
    result.push(name==='eq'?'<code class="ocr2md-latex-pending">':`<${name}${attrs}>`);
    if(!VOID.has(name))stack.push(name);
  }
  return stack.length===0&&cells>0?result.join(''):null;
}
