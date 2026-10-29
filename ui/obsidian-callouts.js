/** Obsidian callouts are a Markdown *preview* projection, never a CMD rewrite.
 * Convert blockquote tokens, not HTML strings/regex over fenced code.
 * HTML <details>/<summary> owns folding natively (keyboard/touch, zero JS).
 */
const MARKER=/^\[![ \t]*([A-Za-z][A-Za-z0-9_-]{0,40})[ \t]*\]([+-])?(?:[ \t]+(.*))?$/;
const ALIAS={summary:'abstract',tldr:'abstract',hint:'tip',important:'tip',
  check:'success',done:'success',help:'question',faq:'question',
  caution:'warning',attention:'warning',fail:'failure',missing:'failure',
  error:'danger',cite:'quote'};
const STYLES=new Set(['note','abstract','info','todo','tip','success','question',
  'warning','failure','danger','bug','example','quote']);
const defaultTitle=type=>type.charAt(0).toUpperCase()+type.slice(1);

export function installObsidianCallouts(md){
  md.core.ruler.after('inline','ocr_callouts',state=>{
    const {tokens}=state;
    for(let i=0;i<tokens.length;i++){
      const quote=tokens[i];
      if(quote.type!=='blockquote_open' || tokens[i+1]?.type!=='paragraph_open' ||
         tokens[i+2]?.type!=='inline')continue;
      const inline=tokens[i+2];
      const split=inline.content.indexOf('\n');
      const first=split===-1?inline.content:inline.content.slice(0,split);
      const match=MARKER.exec(first.trim());
      if(!match)continue;
      let end=i+1,depth=1;
      for(;end<tokens.length;end++){
        if(tokens[end].type==='blockquote_open')depth++;
        if(tokens[end].type==='blockquote_close'&&!--depth)break;
      }
      if(end===tokens.length)continue;
      const type=match[1].toLowerCase(),fold=match[2]??'';
      const normalized=ALIAS[type]||type;
      quote.type='ocr_callout_open';
      quote.meta={calloutType:type,style:STYLES.has(normalized)?normalized:'note',
        fold,title:match[3]?.trim()||defaultTitle(type)};
      const close=tokens[end];
      close.type='ocr_callout_close';close.meta={fold};
      // The initial Markdown paragraph may continue on the very next line:
      // > [!note]- My title
      // > this is *still* callout body, not part of the title.
      const body=split===-1?'':inline.content.slice(split+1);
      if(body){
        inline.content=body;
        inline.children=[];
        state.md.inline.parse(body,state.md,state.env,inline.children);
      }else{
        inline.content='';inline.children=[];
        tokens[i+1].hidden=true;
        if(tokens[i+3]?.type==='paragraph_close')tokens[i+3].hidden=true;
      }
    }
  });
  md.renderer.rules.ocr_callout_open=(tokens,idx)=>{
    const token=tokens[idx];
    const {calloutType,style,fold,title}=token.meta;
    const safeType=md.utils.escapeHtml(calloutType);
    const header=md.renderInline(title);
    const cls='ocr-callout ocr-callout--'+style;
    const start=token.map?` data-source-start="${token.map[0]+1}" data-source-end="${token.map[1]+1}"`:'';
    if(fold)return `<details class="${cls} ocr-callout-foldable" data-callout="${safeType}"${start}${fold==='+'?' open':''}>`+
      `<summary class="ocr-callout-title">${header}</summary><div class="ocr-callout-content">\n`;
    return `<aside class="${cls}" data-callout="${safeType}"${start}>`+
      `<div class="ocr-callout-title">${header}</div><div class="ocr-callout-content">\n`;
  };
  md.renderer.rules.ocr_callout_close=(tokens,idx)=>
    `</div>${tokens[idx].meta.fold?'</details>':'</aside>'}\n`;
}
