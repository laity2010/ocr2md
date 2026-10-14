/** Preview-only adaptation of MinerU HTML tables wrapped in Markdown fences.
 * Markdown itself is never rewritten or saved. V2's shared markdown renderer
 * still sanitizes the complete preview a second time with DOMPurify.
 */
import DOMPurify from "../../v2/node_modules/dompurify";

const TABLE_TAGS=[
  "table","caption","colgroup","col","thead","tbody","tfoot","tr","th","td",
  "p","span","b","strong","i","em","br","small","sup","sub","code","s","u",
];
const TABLE_ATTRS=["rowspan","colspan","align","scope","headers","abbr"];

/** Preserve the original newline count so MD↔source-line anchors still point
 * to the physical lines the user sees in CodeMirror, including the fences.
 * Only one well-formed top-level <table> in an explicitly html-tagged fence
 * is rendered. Ordinary code examples and non-table fences are untouched.
 */
export function renderFencedHtmlTablesInPreview(source:string):string{
  if(!source.includes("```html")&&!source.includes("~~~html")&&
     !/(`{3,}|~{3,})HTML\b/.test(source))return source;
  const lines=source.split("\n");
  let output:string[]|undefined;
  for(let i=0;i<lines.length;i++){
    const opening=/^ {0,3}(`{3,}|~{3,})html[ \t]*$/i.exec(lines[i]);
    if(!opening)continue;
    const fence=opening[1];
    const closing=new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`);
    let end=i+1;
    for(;end<lines.length&&!closing.test(lines[end]);end++){}
    if(end>=lines.length)continue;
    const raw=lines.slice(i+1,end).join("\n").trim();
    if(!/^<table\b[\s\S]*<\/table>$/i.test(raw)){
      i=end;continue;
    }
    const safe=DOMPurify.sanitize(raw,{
      ALLOWED_TAGS:TABLE_TAGS,
      ALLOWED_ATTR:TABLE_ATTRS,
      ALLOW_DATA_ATTR:false,
      ALLOW_ARIA_ATTR:false,
    });
    const fragment=document.createElement("template");
    fragment.innerHTML=safe;
    const topLevel=Array.from(fragment.content.childNodes).filter(node=>
      node.nodeType===Node.ELEMENT_NODE||!!node.textContent?.trim());
    const table=topLevel.length===1&&topLevel[0] instanceof HTMLTableElement?topLevel[0]:undefined;
    if(!table||!table.querySelector("tr>td,tr>th")){
      i=end;continue;
    }
    output??=[...lines];
    output[i]="";
    output[i+1]=table.outerHTML;
    for(let k=i+2;k<=end;k++)output[k]="";
    i=end;
  }
  return output?output.join("\n"):source;
}
