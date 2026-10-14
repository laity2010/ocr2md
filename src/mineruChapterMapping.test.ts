import * as assert from "assert";
import { createHash } from "crypto";
import { extractMineruElements } from "./mineruElementExtractor";
import { mapMineruToChapterDrafts, type MappingDocument, type CanonicalChapter } from "./mineruChapterMapping";

const sha=(s:string)=>createHash("sha256").update(s,"utf8").digest("hex");
function doc(path:string,text:string):MappingDocument{return {path,text,sha256:sha(text)};}
const oldUrl="https://cdn-mineru.test/2026-10-08/abc/"+ "a".repeat(64)+".jpg";
const newUrl="https://cdn-mineru.test/2026-08-26/xyz/"+ "a".repeat(64)+".jpg";
const exact="A unique paragraph remains present unchanged in every version for robust source tracing.";
const changed="This discussion has a substantial starting fragment followed by explanatory material " +
  "which was edited in its middle but keeps a sufficiently recognizable ending fragment for later review.";
const altered=changed.replace("which was edited in its middle","**which was edited in its middle**");
const block=(type:string,content:string,extra:Record<string,unknown>={})=>({
  type,bbox:[10,20,250,90],lines:[{spans:[{type:"text",content}]}],...extra,
});
const json={pdf_info:[{page_idx:0,page_size:[600,800],preproc_blocks:[],
  para_blocks:[
    block("title","Stable heading",{level:2}),
    block("text",exact),
    block("text",changed),
    {type:"image",bbox:[10,20,250,90],blocks:[{type:"image_body",
      lines:[{spans:[{type:"image",image_path:oldUrl}]}]}]},
    block("title","Repeated heading",{level:2}),
    block("text","Only in metadata but not in chapter body"),
    {type:"table",bbox:[10,20,250,90],blocks:[
      {type:"table_caption",bbox:[10,20,250,30],lines:[]},
      {type:"table_body",bbox:[10,30,250,90],lines:[]},
    ]},
    block("text","A paragraph shared in both chapters creating competing positions."),
  ],
  discarded_blocks:[{type:"header",bbox:[0,0,50,20],lines:[]}]}]};
const original="## Stable heading\n\n"+exact+"\n\n"+changed+"\n\n"+
  `![image](${oldUrl})`+"\n\n## Repeated heading\n\n## Repeated heading\n\n"+
  "Only in metadata but not in chapter body\n\n"+
  "A paragraph shared in both chapters creating competing positions.";
const header="---\nnotes: Only in metadata but not in chapter body\n---\n";
const sourceA=header+"\n## Stable heading\n"+exact+"\n"+changed+
  `\n![image](${newUrl})`+"\n## Repeated heading\n"+
  "A paragraph shared in both chapters creating competing positions.";
const workingA=header+"\n## Stable heading\n"+exact+"\n"+altered+
  `\n![image](${newUrl})`+"\n## Repeated heading\n"+
  "A paragraph shared in both chapters creating competing positions.";
const sourceB="---\nchapter: two\n---\n\n## Repeated heading\n"+
  "A paragraph shared in both chapters creating competing positions.";
const chapterA:CanonicalChapter={
  chapterId:"01",source:doc("/books/chapters/01/01.md",sourceA),
  working:doc("/books/chapters/01/01.working.md",workingA),
};
const chapterB:CanonicalChapter={
  chapterId:"02",source:doc("/books/chapters/02/02.md",sourceB),
  working:doc("/books/chapters/02/02.working.md",sourceB),
};
const originalDoc=doc("/books/md/mineru.md",original);
const index=extractMineruElements(new TextEncoder().encode(JSON.stringify(json)));
const hashes=[chapterA.source.sha256,chapterA.working.sha256,chapterB.source.sha256,chapterB.working.sha256,
  originalDoc.sha256];
const result=mapMineruToChapterDrafts(index,originalDoc,[chapterA,chapterB]);
assert.equal(result.elements.length,8);
assert.equal(result.ignoredDiscardedCount,1);
assert.equal(result.chapterVersions.length,2);
const [heading,para,edited,image,duplicate,metadata,empty,competition]=result.elements;
assert.equal(heading.status,"candidate-complete");
assert.equal(heading.manuallyVerified,false);
assert.deepEqual(heading.chapters,["01"]);
assert.equal(para.status,"candidate-complete");
assert.equal(edited.status,"candidate-partial");
assert.equal(edited.originalMdState,"unique");
assert.deepEqual(edited.chapters,["01"]);
assert.equal(edited.parts[0].chapterAnchors[0].state,"unique");
assert.equal(edited.parts[0].workingAnchors[0].state,"partial-evidence");
assert.equal(edited.parts[0].workingAnchors[0].rangesUtf16.length,0);
assert.equal(edited.parts[0].workingAnchors[0].fragmentEvidenceUtf16.length,2);
assert.equal(image.status,"candidate-complete","unique long hex image leaf may survive changed CDN prefix");
const imageAnchor=image.parts[0].workingAnchors[0];
const imageRange=imageAnchor.rangesUtf16[0];
assert.equal(chapterA.working.text.slice(...imageRange),`![image](${newUrl})`);
assert.equal(imageAnchor.matchedTextSha256,sha(`![image](${newUrl})`));
assert.equal(duplicate.status,"ambiguous");
assert.equal(competition.status,"ambiguous");
assert.equal(metadata.status,"unmatched","matching frontmatter alone must not establish an anchor");
assert.equal(empty.status,"unavailable");
assert.equal(empty.parts.length,0);
const paraAnchor=para.parts[0].workingAnchors[0];
assert.equal(chapterA.working.text.slice(...paraAnchor.rangesUtf16[0]),exact);
assert.equal(paraAnchor.sha256,chapterA.working.sha256);
assert.equal(paraAnchor.previousContextSha256?.length,64);
assert.deepEqual(hashes,[chapterA.source.sha256,chapterA.working.sha256,
  chapterB.source.sha256,chapterB.working.sha256,originalDoc.sha256]);
const repeat=mapMineruToChapterDrafts(index,originalDoc,[chapterA,chapterB]);
assert.deepEqual(repeat,result,"same source and drafts must produce deterministic mapping");
assert.throws(()=>mapMineruToChapterDrafts(index,
  {...originalDoc,sha256:"0".repeat(64)},[chapterA]),/Stale document/);
assert.throws(()=>mapMineruToChapterDrafts(index,originalDoc,
  [{...chapterA,working:doc("/books/chapters/01/WRONG.working.md",workingA)}]),
  /canonical chapter pair/);
assert.throws(()=>mapMineruToChapterDrafts(index,originalDoc,[chapterA,chapterA]),/Duplicate/);
console.log("WP3_CHAPTER_MAPPING_UNIT_OK",{complete:result.elements.filter(e=>e.status==="candidate-complete").length,
  partial:result.elements.filter(e=>e.status==="candidate-partial").length,
  ambiguous:result.elements.filter(e=>e.status==="ambiguous").length,
  unavailable:result.elements.filter(e=>e.status==="unavailable").length,
  unmatched:result.elements.filter(e=>e.status==="unmatched").length,
  noWrites:true});
