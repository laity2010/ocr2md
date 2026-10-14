import * as assert from 'node:assert/strict';
import {importMineruDocumentIrFromBytes,reconstructMineruJsonFromIr} from './documentIrImport';
import {proposeIrReconstruction} from './documentIrReconstruction';
import {proposeIrChapters,insertManualPdfHeading,deleteManualPdfHeading} from './documentIrChapters';
import {generateIrMarkdownBundle,generateIrWholeBookMarkdown} from './documentIrMarkdown';
import {applyDirSourceChange} from './dirSourceEditing';
import {validateDocumentIrV1} from './documentIrV1';
const b=(type:string,content:string,level?:number)=>({type,index:1,bbox:[30,60,410,99],
  ...(level?{level}:{}),lines:[{spans:[{type:'text',content}]}]});
const source={_version_name:'fixture',pdf_info:[{page_idx:0,page_size:[612,792],
  preproc_blocks:[],discarded_blocks:[],para_blocks:[b('title','My Book',1),
    b('text','Introduction body'),b('title','Subsection',2),b('text','First findings'),
    b('text','A normal paragraph'),b('text','Final body')]}]};
const initial=proposeIrChapters(proposeIrReconstruction(importMineruDocumentIrFromBytes('ocr2md',
  '/book/original.pdf',new Uint8Array([0,2]),'/book/json/MinerU.json',
  new TextEncoder().encode(JSON.stringify(source)))));
const getFile=(doc:typeof initial)=>generateIrMarkdownBundle(doc).files[0];
const changed=(file:ReturnType<typeof getFile>,blockId:string,value:string)=>{
  const r=file.ranges.find(r=>r.blockId===blockId)!;
  return file.content.slice(0,r.contentFrom)+value+file.content.slice(r.contentTo);
};
const unchanged=getFile(initial),ids=initial.blocks.map(b=>b.blockId);
let doc=applyDirSourceChange(initial,unchanged,changed(unchanged,ids[0],'# My Corrected Book'));
assert.equal(doc.blocks[0].text,'My Corrected Book');
assert.equal(doc.chapters[0].name,'My Corrected Book');
assert.equal(generateIrMarkdownBundle(doc).files[0].content.includes('# My Corrected Book'),true);
assert.deepEqual(reconstructMineruJsonFromIr(doc),source);
// Free source correction of existing body is source-anchored, never raw OCR.
let file=getFile(doc);
doc=applyDirSourceChange(doc,file,changed(file,ids[1],'Introduction correctly transcribed.'));
assert.equal(doc.blocks[1].text,'Introduction correctly transcribed.');
// Promoting existing OCR body into a missing PDF heading adds it to the chapter tree.
file=getFile(doc);
doc=applyDirSourceChange(doc,file,changed(file,ids[4],'## A missing heading'));
assert.equal(doc.blocks[4].type,'title');
assert.equal(doc.blocks[4].text,'A missing heading');
assert.ok(doc.chapterStructure?.candidates.some(c=>c.headingBlockId===ids[4]));
assert.equal(doc.chapters.find(c=>c.anchorBlockId===ids[4])?.depth,2);
assert.deepEqual(reconstructMineruJsonFromIr(doc),source);
// Removing an OCR heading marker removes its chapter identity but preserves OCR evidence.
file=getFile(doc);
doc=applyDirSourceChange(doc,file,changed(file,ids[2],'Subsection'));
assert.equal(doc.chapters.some(ch=>ch.anchorBlockId===ids[2]),false);
assert.equal(doc.blocks[2].text,'Subsection');
assert.ok(getFile(doc).content.includes('\nSubsection\n'));
assert.ok(getFile(doc).content.includes('## A missing heading'));
assert.deepEqual(reconstructMineruJsonFromIr(doc),source);
file=getFile(doc);
assert.throws(()=>applyDirSourceChange(doc,file,file.content.replace(/<!-- ocr2md-ir:block=[^>]+ -->\n/,'') ),/锚点/);
assert.throws(()=>applyDirSourceChange(doc,file,file.content.replace(ids[1],ids[2])),/锚点/);
assert.throws(()=>applyDirSourceChange(doc,file,'Unanchored header\n'+file.content),/章节起始结构/);
assert.throws(()=>applyDirSourceChange(doc,file,changed(file,ids[1],'Introduction\n# new unanchored heading')),/PDF 锚点/);
assert.deepEqual(reconstructMineruJsonFromIr(doc),source);
assert.notEqual(doc,initial);
validateDocumentIrV1(doc);
// Real Bufett's Alpha line 59: OCR-provisional H3 author byline.
// Demote stepwise: H3 -> H2 -> H1 -> ordinary body. Never change source OCR.
const bylineText='Andrea Frazzini, David Kabiller, CFA,and Lasse Heje Pedersen';
const bylineSource={...source,pdf_info:source.pdf_info.map(p=>({...p,
  para_blocks:[p.para_blocks[0],b('title',bylineText,2),...p.para_blocks.slice(1)]}))};
let bylineIr=proposeIrChapters(proposeIrReconstruction(importMineruDocumentIrFromBytes('ocr2md',
  '/book/original.pdf',new Uint8Array([0,2]),'/book/json/MinerU.json',
  new TextEncoder().encode(JSON.stringify(bylineSource)))));
const bylineId=bylineIr.blocks.find(b=>b.text===bylineText)!.blockId;
for(const [before,after] of [['### '+bylineText,'## '+bylineText],
  ['## '+bylineText,'# '+bylineText],['# '+bylineText,bylineText]]){
  const beforeFile=generateIrWholeBookMarkdown(bylineIr);
  const r=beforeFile.ranges.find(r=>r.blockId===bylineId)!;
  assert.equal(beforeFile.content.slice(r.contentFrom,r.contentTo),before);
  const next=beforeFile.content.slice(0,r.contentFrom)+after+beforeFile.content.slice(r.contentTo);
  bylineIr=applyDirSourceChange(bylineIr,beforeFile,next);
  const newFile=generateIrWholeBookMarkdown(bylineIr);
  const newRange=newFile.ranges.find(r=>r.blockId===bylineId)!;
  assert.equal(newFile.content.slice(newRange.contentFrom,newRange.contentTo),
    after.replace(/^ /u,''),
    'removing # must persist and strip only the leftover heading-formatting space');
}
assert.equal(bylineIr.blocks.find(b=>b.blockId===bylineId)?.type,'text',
  'OCR misclassified title must become an actual DIRjson text block');
assert.equal(bylineIr.chapterStructure?.candidates.some(c=>c.headingBlockId===bylineId),false,
  'demoted author byline must no longer appear as chapter proposal');
assert.deepEqual(reconstructMineruJsonFromIr(bylineIr),bylineSource);
// Re-adding a # must be reversible without resetting the OCR evidence.
const demotedFile=generateIrWholeBookMarkdown(bylineIr);
const demotedRange=demotedFile.ranges.find(r=>r.blockId===bylineId)!;
const restored=applyDirSourceChange(bylineIr,demotedFile,
  demotedFile.content.slice(0,demotedRange.contentFrom)+'## '+
  demotedFile.content.slice(demotedRange.contentFrom));
assert.equal(restored.blocks.find(b=>b.blockId===bylineId)?.type,'title');
assert.equal(restored.chapters.find(c=>c.anchorBlockId===bylineId)?.depth,2);
assert.deepEqual(reconstructMineruJsonFromIr(restored),bylineSource);
// Regression: a missing OCR heading is transcribed from the PDF, then the
// user pastes multi-paragraph body text below it in the real source editor.
const withHeading=insertManualPdfHeading(initial,ids[1],'Restored from PDF',1,1,'PDF first page');
const addedHeading=withHeading.manualHeadings!.at(-1)!;
const full=generateIrWholeBookMarkdown(withHeading);
const headingRange=full.ranges.find(r=>r.blockId===addedHeading.blockId)!;
const body='Pasted paragraph one.\n\nSecond copied paragraph with <literal> text.';
const inserted=full.content.slice(0,headingRange.contentTo)+'\n\n'+body+
  full.content.slice(headingRange.contentTo);
const pause=full.content.slice(0,headingRange.contentTo)+'\n'+
  full.content.slice(headingRange.contentTo);
assert.equal(applyDirSourceChange(withHeading,full,pause),withHeading,
  'single Enter below restored title is a valid transient editor state');
const oneReturn=full.content.slice(0,headingRange.contentTo)+'\n'+body+
  full.content.slice(headingRange.contentTo);
assert.equal(applyDirSourceChange(withHeading,full,oneReturn).manualTexts?.length,1);
const withBody=applyDirSourceChange(withHeading,full,inserted);
assert.equal(withBody.blocks.length,withHeading.blocks.length+1);
assert.equal(withBody.manualTexts?.length,1);
const manualBody=withBody.manualTexts![0];
assert.equal(manualBody.pdfPageNumber,1);
assert.equal(withBody.blocks.find(b=>b.blockId===manualBody.blockId)?.text,body);
assert.deepEqual(withBody.blocks.find(b=>b.blockId===manualBody.blockId)?.sources,[]);
assert.ok(generateIrWholeBookMarkdown(withBody).content.includes('Second copied paragraph'));
assert.deepEqual(reconstructMineruJsonFromIr(withBody),source);
// Deleting the restored title keeps its manually transcribed body and honest
// PDF page; original OCR remains immutable. A synthetic chapter is removed.
const deleted=deleteManualPdfHeading(withBody,addedHeading.blockId,'PDF correction: heading not present');
assert.equal(deleted.manualHeadings?.length,0);
assert.equal(deleted.manualTexts?.length,1);
assert.equal(deleted.blocks.length,withBody.blocks.length-1);
assert.equal(deleted.blocks.some(b=>b.blockId===addedHeading.blockId),false);
assert.equal(deleted.manualTexts![0].pdfPageNumber,1);
assert.equal(deleted.manualTexts![0].afterBlockId,ids[1]);
assert.equal(deleted.blocks.find(b=>b.blockId===manualBody.blockId)?.text,body);
assert.equal(deleted.chapters.some(c=>c.anchorBlockId===addedHeading.blockId),false);
assert.deepEqual(reconstructMineruJsonFromIr(deleted),source);
assert.ok(generateIrWholeBookMarkdown(deleted).content.includes('Second copied paragraph'));
assert.throws(()=>deleteManualPdfHeading(initial,ids[0],'try deleting OCR heading'),/人工补录标题/);
// Source text deletion is equivalent to the gutter menu; non-manual markers stay guarded.
const cleared=full.content.slice(0,headingRange.contentFrom)+
  full.content.slice(headingRange.contentTo);
const clearResult=applyDirSourceChange(withHeading,full,cleared);
assert.equal(clearResult.manualHeadings?.length,0);
assert.equal(clearResult.blocks.some(b=>b.blockId===addedHeading.blockId),false);
assert.deepEqual(reconstructMineruJsonFromIr(clearResult),source);
const wholeRangeDeleted=full.content.slice(0,headingRange.from)+full.content.slice(headingRange.to);
assert.equal(applyDirSourceChange(withHeading,full,wholeRangeDeleted).manualHeadings?.length,0);
assert.throws(()=>applyDirSourceChange(withHeading,full,
  full.content.replace(/<!-- ocr2md-ir:block=[^>]+ -->\n/,'') ),/锚点/);


assert.throws(()=>applyDirSourceChange(withHeading,full,full.content+'Unanchored tail\n'),/分隔符|锚点/);
console.log('DIR_SOURCE_EDIT_UNIT_PASS',JSON.stringify({blocks:doc.blocks.length,
  titleCorrected:true,bodyCorrected:true,promotedHeading:true,removedHeading:true,
  rawOcrImmutable:true,unanchoredRejected:true,markerGuarded:true}));
