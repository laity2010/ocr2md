/* Generate small but canonical IR ZIP fixture for isolated publication tests. */
const fs=require('node:fs'),path=require('node:path');
const compiled=path.resolve(__dirname,'../../../.tmp/ir-wp6/compiled');
const {importMineruDocumentIrFromBytes}=require(path.join(compiled,'documentIrImport.js'));
const {proposeIrReconstruction}=require(path.join(compiled,'documentIrReconstruction.js'));
const {proposeIrChapters,explicitClassifyOcrHeading,v2IrAssignSequence,v2IrSetStandalone,v2IrChapterHeadings}=require(path.join(compiled,'documentIrChapters.js'));
const {generateIrMarkdownBundle,isIrChapterDelimitationConfirmed}=require(path.join(compiled,'documentIrMarkdown.js'));
const {buildIrMarkdownArchive}=require(path.join(compiled,'documentIrArchive.js'));
const dir=process.argv[2];if(!dir)throw Error('directory argument required');
const b=(type,content,level)=>({type,bbox:[10,20,220,100],...(level?{level}:{}),lines:[{spans:[{type:'text',content}]}]});
const ocr={pdf_info:[{page_idx:0,page_size:[612,792],preproc_blocks:[],discarded_blocks:[],para_blocks:[b('title','Chapter One',1),b('text','Original chapter one body.'),b('title','Chapter Two',1),b('text','Original chapter two body.')] }]};
const {testPdf}=require('./fixturePdf.cjs');
const pdf=new Uint8Array(testPdf({paddingBytes:32*1024}));const json=new TextEncoder().encode(JSON.stringify(ocr));
fs.mkdirSync(path.join(dir,'json'),{recursive:true});
fs.writeFileSync(path.join(dir,'original.pdf'),pdf);fs.writeFileSync(path.join(dir,'json','original.json'),json);
let doc=proposeIrChapters(proposeIrReconstruction(importMineruDocumentIrFromBytes('obsidian-ocr2md','/ocr2md/Book/original.pdf',pdf,'/ocr2md/Book/json/original.json',json)));
fs.writeFileSync(path.join(dir,'unconfirmed.zip'),buildIrMarkdownArchive(doc,generateIrMarkdownBundle(doc)).bytes);
// Explicitly named file cuts are publishable for cleaning while OCR titles
// retain their needs-review audit state.
const headings=v2IrChapterHeadings(doc);
if(headings.length!==2)throw Error('fixture should have two candidate headings');
const cleaningDoc=v2IrAssignSequence(v2IrSetStandalone(doc,headings[1].blockId,true),'01');
const cleaning=buildIrMarkdownArchive(cleaningDoc,generateIrMarkdownBundle(cleaningDoc));
fs.writeFileSync(path.join(dir,'cleaning.zip'),cleaning.bytes);
for(const c of [...doc.chapterStructure.candidates].reverse()){
 doc=explicitClassifyOcrHeading(doc,c.headingBlockId,'root',undefined,'Verified against sample PDF');
}
doc=v2IrAssignSequence(doc,'01');
if(!isIrChapterDelimitationConfirmed(doc))throw Error('fixture IR must be confirmed');
if(generateIrMarkdownBundle(doc).files.length!==2)throw Error('fixture must split into two files');
const blob=buildIrMarkdownArchive(doc,generateIrMarkdownBundle(doc));
fs.writeFileSync(path.join(dir,'confirmed.zip'),blob.bytes);
console.log('FIXTURE_CONFIRMED_ARCHIVE',blob.size,'bytes',doc.chapterStructure.candidates.length,'decisions');
