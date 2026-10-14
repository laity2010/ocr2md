import * as assert from "assert";
import { extractMineruElements } from "./mineruElementExtractor";
import { reconstructMineruMarkdown, compareMineruCandidateWithOriginalMd,
  compareMineruIndexWithOriginalMd } from "./mineruMarkdownReconstruction";

function element(type:string, data:object, index=0, page=0) {
  const payload={pdf_info:[{page_idx:0,page_size:[600,800],
    para_blocks:[{type,bbox:[10,20,120,80],index,...data}],discarded_blocks:[],
    preproc_blocks:[]},...(page===1?[{page_idx:1,page_size:[800,600],para_blocks:[],discarded_blocks:[],
      preproc_blocks:[]}]:[])]};
  const idx=extractMineruElements(new TextEncoder().encode(JSON.stringify(payload)));
  return idx.bodyElements[index];
}
const line=(value:string)=>[{bbox:[10,20,120,80],spans:[{type:"text",content:value,bbox:[10,20,120,80]}]}];
const title=element("title",{level:2,lines:line("Theorem 😀")});
const head=reconstructMineruMarkdown(title);
assert.equal(head.proposal,"## Theorem 😀");
assert.equal(head.reconstruction,"ready");
const headingMd="# Introduction\n\n## Theorem 😀\n\nContent";
const headingMatch=compareMineruCandidateWithOriginalMd(head,headingMd);
assert.equal(headingMatch.state,"unique");
assert.deepEqual(headingMatch.rangesUtf16,[[headingMd.indexOf("Theorem"),headingMd.indexOf("Theorem")+"Theorem 😀".length]]);
assert.equal(headingMd.slice(...headingMatch.rangesUtf16[0]),"Theorem 😀","UTF-16 slicing must return the exact evidence text");
assert.equal(compareMineruCandidateWithOriginalMd(head,"## Theorem 😀\n## Theorem 😀").state,"ambiguous");
assert.equal(compareMineruCandidateWithOriginalMd(head,"# Other title").state,"not-found");

const text=element("text",{lines:[...line("When the reader"),...line("continues across the page")],merge_prev:true});
const para=reconstructMineruMarkdown(text);
assert.ok(para.warnings.some(w=>w.startsWith("merge_prev")));
assert.equal(para.proposal,"When the reader continues across the page");
const paraMd="Before\nWhen the reader   continues across the page\nAfter";
assert.equal(compareMineruCandidateWithOriginalMd(para,paraMd).state,"unique");
const long="The first part is an interesting statement containing sufficient context and spelling " +
  "but an inserted emphasis creates a middle discrepancy in the converted document " +
  "and the final context can still be independently found nearby in the original markdown.";
const longPara=reconstructMineruMarkdown(element("text",{lines:line(long)}));
const changed=long.replace("middle discrepancy","**middle discrepancy**");
const partial=compareMineruCandidateWithOriginalMd(longPara,changed);
assert.equal(partial.state,"partial-evidence");
assert.ok(partial.matches[0].fragmentEvidenceUtf16.length===2);
assert.deepEqual(partial.rangesUtf16,[],"fragments do not create a confirmed full anchor");

const url="https://example.test/resource.png";
const image=element("image",{blocks:[{type:"image_body",bbox:[10,20,120,80],
  lines:[{spans:[{type:"image",image_path:url,bbox:[10,20,120,80]}]}]}]});
const proposal=reconstructMineruMarkdown(image);
assert.equal(proposal.proposal,`![image](${url})`);
assert.equal(compareMineruCandidateWithOriginalMd(proposal,`Caption\n![figure](${url})`).state,"unique");
assert.equal(compareMineruCandidateWithOriginalMd(proposal,`Plain URL: ${url}`).state,"not-found");
const formula=element("interline_equation",{lines:[{spans:[{type:"interline_equation",
  content:"a \\frac{b}{c}",image_path:"https://example.test/eq.jpg"}]}]});
const eq=reconstructMineruMarkdown(formula);
assert.ok(eq.proposal?.startsWith("$$\na \\frac"));
assert.equal(eq.parts[0].lookup,"a \\frac{b}{c}");
assert.equal(compareMineruCandidateWithOriginalMd(eq,"$$\na \\frac{b}{c}\n$$").state,"unique");

const table=element("table",{blocks:[
  {type:"table_caption",bbox:[10,20,120,30],lines:line("Table 7 title")},
  {type:"table_body",bbox:[10,30,120,70],
    lines:[{spans:[{type:"table",html:"<table><tr><td>Value</td></tr></table>"}]}]},
  {type:"table_footnote",bbox:[10,70,120,80],lines:line("Table notes text")}
]});
const tbl=reconstructMineruMarkdown(table);
assert.equal(tbl.reconstruction,"ready");
assert.deepEqual(tbl.parts.map(p=>p.kind),["caption","table-html","footnote"]);
const compositeMd="Table 7 title\n\n<table><tr><td>Value</td></tr></table>\n\nTable notes text";
const composite=compareMineruCandidateWithOriginalMd(tbl,compositeMd);
assert.equal(composite.state,"unique");
assert.equal(composite.rangesUtf16.length,3);
const reordered=compareMineruCandidateWithOriginalMd(tbl,
  "Table notes text\n<table><tr><td>Value</td></tr></table>\nTable 7 title");
assert.equal(reordered.state,"ambiguous","reordered composite evidence is NOT unique");
const noHtml=compareMineruCandidateWithOriginalMd(tbl,"Table 7 title\nTable notes text");
assert.equal(noHtml.state,"partial-evidence");

const emptyTable=element("table",{blocks:[
  {type:"table_caption",bbox:[10,20,120,30],lines:[]},
  {type:"table_body",bbox:[10,30,120,70],lines:[]},
  {type:"table_footnote",bbox:[10,70,120,80],lines:[]},
]});
const missing=reconstructMineruMarkdown(emptyTable);
assert.equal(missing.reconstruction,"unavailable");
assert.equal(missing.proposal,null);
assert.equal(compareMineruCandidateWithOriginalMd(missing,"<table>NOT FROM JSON</table>").state,"unavailable");
assert.ok(missing.warnings.some(w=>w.startsWith("table_body-without-content")));

const chart=element("chart",{blocks:[
  {type:"chart_caption",bbox:[10,20,120,30],lines:line("Figure 1 caption")},
  {type:"chart_body",bbox:[10,30,120,70],
    lines:[{spans:[{type:"chart",image_path:"https://example.test/chart.jpg"}]}]},
]});
const fig=reconstructMineruMarkdown(chart);
assert.deepEqual(fig.parts.map(p=>p.kind),["caption","image"]);
assert.equal(compareMineruCandidateWithOriginalMd(fig,
  "Figure 1 caption\n\n![image](https://example.test/chart.jpg)").state,"unique");
const ref=reconstructMineruMarkdown(element("ref_text",{lines:line("Sources, 2026.")}));
assert.equal(ref.parts[0].kind,"reference");
const unknown=reconstructMineruMarkdown(element("unfamiliar",{lines:line("Source")}));
assert.equal(unknown.reconstruction,"unavailable");
assert.equal(unknown.proposal,null);
const emptyText=reconstructMineruMarkdown(element("text",{lines:[],lines_deleted:[1]}));
assert.equal(emptyText.reconstruction,"unavailable");
const batch=extractMineruElements(new TextEncoder().encode(JSON.stringify({pdf_info:[
  {page_idx:0,page_size:[600,800],para_blocks:[
    {type:"title",bbox:[10,20,120,80],level:2,lines:line("Theorem 😀")},
    {type:"text",bbox:[10,20,120,80],lines:line("Sources, 2026.")}],
    discarded_blocks:[{type:"header",bbox:[0,0,50,30],lines:line("Header")}]}
]})));
assert.equal(compareMineruIndexWithOriginalMd(batch,"Theorem 😀\nSources, 2026.").length,2,
  "discarded header should never count as Markdown content");
console.log("WP2_MD_RECONSTRUCTION_UNIT_OK",{testedKinds:["heading","paragraph","image","formula",
  "table-html","chart","reference"],emptyTable:true,emptyText:true,duplicates:true,
  multiPart:true,fragments:true,utf16:true});
