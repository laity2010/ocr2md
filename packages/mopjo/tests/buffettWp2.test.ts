/** WP2 mandatory business fixture: exact saved DIRjson snapshot and real Buffett PDF.
 * Inputs are READ-ONLY; every CLI persistence and generated MD lives in OS temp.
 */
import * as assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {emptyDelta,open,applyElementOperation,queryElements,locatePdf,locatePdfPoint,
  locateMarkdown,exportMarkdown,importEditedMarkdown,sha256,encodeDelta} from '../src/core';
import type {EditRequest} from '../src/core';
import {validateDocumentIrV1} from '../src/ir/documentIrV1';
const [realDirPath,realPdfPath]=process.argv.slice(2);
if(!realDirPath||!realPdfPath)throw Error('usage: buffettWp2.test.mjs <real saved IR JSON> <original Buffett PDF>');
const baselineRaw=readFileSync(realDirPath),pdfRaw=readFileSync(realPdfPath);
const sourceIrSha=sha256(baselineRaw),sourcePdfSha=sha256(pdfRaw);
const original=JSON.parse(baselineRaw.toString());validateDocumentIrV1(original);
assert.equal(original.pdf.sha256,sourcePdfSha,'same real PDF as bound by V4 saved DIRjson');
assert.equal(original.pages.length,22);assert.equal(original.blocks.length,224);
const dir=mkdtempSync(join(tmpdir(),'mopjo-buffett-wp2-'));
const copyIr=join(dir,'baseline.dir.json'),copyPdf=join(dir,'buffett.pdf');
const pkg=join(dir,'mopjo'),mdFile=join(dir,'review.md'),opFile=join(dir,'operation.json');
const cli=[resolve(process.cwd(),'dist/cli.mjs'),
  resolve(process.cwd(),'packages/mopjo/dist/cli.mjs')].find(existsSync);
if(!cli)throw Error('MOPJO_CLI_NOT_BUILT');
const cliRun=(...args:string[])=>JSON.parse(execFileSync(process.execPath,[cli,...args],
  {encoding:'utf8',maxBuffer:16*1024*1024}));
const readDelta=()=>JSON.parse(readFileSync(join(pkg,'changes.json'),'utf8'));
const readOpened=()=>open(original,readDelta(),pdfRaw);
let cases=0;
const check=(value:unknown,message:string)=>{assert.ok(value,message);cases++;};
const expectRefusal=(request:EditRequest,reason:string)=>{
  writeFileSync(opFile,JSON.stringify(request));const before=readFileSync(join(pkg,'changes.json'));
  const rejected=spawnSync(process.execPath,[cli,'operate',pkg,copyPdf,opFile],{encoding:'utf8'});
  assert.notEqual(rejected.status,0,reason);assert.equal(readFileSync(join(pkg,'changes.json')).equals(before),true);
  cases++;
};
try{
  copyFileSync(realDirPath,copyIr);copyFileSync(realPdfPath,copyPdf);
  assert.equal(cliRun('init-ir',copyIr,copyPdf,pkg).status,'MOPJO_INIT_IR_OK');cases++;
  assert.equal(sha256(readFileSync(join(pkg,'original.dir.json'))),sourceIrSha);cases++;
  assert.equal(cliRun('render',pkg,copyPdf,mdFile).status,'MOPJO_RENDER_OK');cases++;
  let view=readOpened();const baseline=view.markdown.content;
  const count=(type:string)=>queryElements(view,{type}).length;
  const tally={text:count('text'),title:count('title'),image:count('image'),
    table:count('table'),interline_equation:count('interline_equation'),
    chart:count('chart'),ref_text:count('ref_text')};
  assert.deepEqual(tally,{text:143,title:21,image:7,table:9,interline_equation:20,chart:4,ref_text:20});cases++;
  for(const type of ['table','interline_equation','image','chart']){
    const rich=queryElements(view,{type});check(rich.length>0&&rich.every(e=>e.pdfRegions.length>0&&
      e.originalElementIds.length>0&&e.markdownRange!==null),'rich element exact OCR/PDF mapping '+type);
  }
  check(queryElements(view).some(e=>e.media.some(m=>m.type==='html')),'HTML tables exposed as original element payload');
  check(queryElements(view).some(e=>e.media.some(m=>m.type==='image')),'image sources exposed');
  check(queryElements(view).some(e=>e.media.some(m=>m.type==='formula')),'formula sources exposed');
  const candidates=queryElements(view,{type:'text'}).filter(e=>e.text.length>70&&
    !original.chapters.some((c:{anchorBlockId?:string})=>c.anchorBlockId===e.blockId));
  const target=candidates.find(e=>e.pdfRegions.length===1)!;
  check(Boolean(target),'find Buffett real OCR paragraph');
  const savedLoc=locatePdf(view,target.blockId),savedMd=locateMarkdown(view,target.blockId);
  const center=savedLoc.regions[0].normalizedBBox;
  const point=locatePdfPoint(view,savedLoc.pages[0],(center[0]+center[2])/2,(center[1]+center[3])/2);
  check(['unique','ambiguous'].includes(point.kind),'PDF point lookup has no fabricated match');
  const expectedView=readFileSync(mdFile,'utf8');
  const oldText=view.markdown.content.slice(savedMd.from,savedMd.to);
  check(oldText.length>20&&expectedView.includes(oldText),'byte source offset matches PDF block');
  // UPDATE: genuine Markdown edit becomes only delta; no baseline content update.
  writeFileSync(mdFile,expectedView.replace(oldText,oldText+' [WP2-审阅修正]'));
  assert.equal(cliRun('edit',pkg,copyPdf,mdFile).status,'MOPJO_EDIT_OK');cases++;
  view=readOpened();
  check(queryElements(view).find(e=>e.blockId===target.blockId)?.text.endsWith('[WP2-审阅修正]'),
    'text edit changed effective DIR state');
  assert.deepEqual(locatePdf(view,target.blockId),savedLoc);cases++;
  // DELETE: tombstone removes the text from MD, but original evidence still locates in PDF.
  writeFileSync(opFile,JSON.stringify({kind:'suppress-block',blockId:target.blockId}));
  assert.equal(cliRun('operate',pkg,copyPdf,opFile).status,'MOPJO_OPERATE_OK');cases++;
  view=readOpened();
  const tomb=queryElements(view).find(e=>e.blockId===target.blockId)!;
  check(tomb.suppressed&&tomb.markdownRange===null,'suppressed element absent only from MD');
  assert.deepEqual(locatePdf(view,target.blockId),savedLoc);cases++;
  assert.throws(()=>locateMarkdown(view,target.blockId),/BLOCK_NOT_VISIBLE/);cases++;
  expectRefusal({kind:'suppress-block',blockId:target.blockId},'duplicate suppression rejected');
  // RESTORE: latest corrected body reappears exactly, not overwritten by OCR text.
  writeFileSync(opFile,JSON.stringify({kind:'restore-block',blockId:target.blockId}));
  assert.equal(cliRun('operate',pkg,copyPdf,opFile).status,'MOPJO_OPERATE_OK');cases++;
  view=readOpened();
  check(!queryElements(view).find(e=>e.blockId===target.blockId)?.suppressed,
    'restoring tombstone recovers effective edited text');
  check(view.markdown.content.includes(oldText+' [WP2-审阅修正]'),
    'MD regenerated from effective DIR + delta after restore');
  // CREATE: a text transcription is explicitly attached to a verified page ONLY,
  // never inventing an OCR source ID or bbox.
  const anchor=queryElements(view,{type:'text'}).find(e=>e.pdfPages.length===1&&
    e.text.length>25&&e.text!==target.text)!;
  const request:EditRequest={kind:'insert-manual-text',afterBlockId:anchor.blockId,
    pdfPageNumber:anchor.pdfPages[0],text:'Buffett’s Alpha',
    detail:'WP2 在 Buffett PDF 上对照封面文字进行补录演示，仅绑定明确的页码'};
  writeFileSync(opFile,JSON.stringify(request));
  assert.equal(cliRun('operate',pkg,copyPdf,opFile).status,'MOPJO_OPERATE_OK');cases++;
  view=readOpened();const added=queryElements(view,{origin:'manual'}).find(e=>e.text==='Buffett’s Alpha')!;
  check(Boolean(added)&&added.pdfPages.length===1&&added.pdfRegions.length===0&&
    added.originalElementIds.length===0,'human inserted source has page but NO fabricated bbox');
  check(added.markdownRange!==null,'human text projected into Markdown with new stable block ID');
  expectRefusal({...request,pdfPageNumber:22},'manual PDF page mismatch rejected');
  expectRefusal({kind:'suppress-block',blockId:original.chapters[0].anchorBlockId!},
    'chapter root anchor protected');
  // SPLIT+MERGE: find real block whose text has fully splittable OCR segment provenance.
  const sourceMap=new Map(original.sourceElements.map((s:{id:string})=>[s.id,s]));
  const splittable=original.blocks.find((b:{type:string;sources:readonly {elementId:string}[];text:string;blockId:string})=>{
    if(b.type!=='text'||b.sources.length!==1||b.text.length<45||b.text.length>400||
       b.blockId===target.blockId||b.blockId===anchor.blockId)return false;
    const source=sourceMap.get(b.sources[0].elementId) as {segments:{content?:string;html?:string;imagePath?:string}[]}|undefined;
    return source?.segments.length===1&&source.segments[0].content===b.text&&
      !source.segments[0].html&&!source.segments[0].imagePath;
  });
  check(Boolean(splittable),'found real Buffett OCR block with exact split provenance');
  const originalSplitSources=locatePdf(view,splittable!.blockId);
  writeFileSync(opFile,JSON.stringify({kind:'split-text',blockId:splittable!.blockId,
    offset:Math.floor(splittable!.text.length/2),detail:'WP2 人工确认断行后拆分'}));
  assert.equal(cliRun('operate',pkg,copyPdf,opFile).status,'MOPJO_OPERATE_OK');cases++;
  view=readOpened();const newIndex=queryElements(view).findIndex(e=>e.blockId===splittable!.blockId);
  const left=queryElements(view)[newIndex],right=queryElements(view)[newIndex+1];
  check(Boolean(right)&&left.text+right.text===splittable!.text,'split preserves every UTF-16 code unit');
  check(Boolean(right)&&right.blockId!==left.blockId,'split allocated a new stable block ID');
  assert.deepEqual(locatePdf(view,left.blockId).pages,originalSplitSources.pages);cases++;
  assert.deepEqual(locatePdf(view,right.blockId).pages,originalSplitSources.pages);cases++;
  writeFileSync(opFile,JSON.stringify({kind:'merge-text',leftBlockId:left.blockId,rightBlockId:right.blockId,
    detail:'WP2 人工确认两个片段是连续正文'}));
  assert.equal(cliRun('operate',pkg,copyPdf,opFile).status,'MOPJO_OPERATE_OK');cases++;
  view=readOpened();
  check(queryElements(view).find(e=>e.blockId===left.blockId)?.text===splittable!.text,
    'merge reconstructs exact original content');
  check(!queryElements(view).some(e=>e.blockId===right.blockId),'merged-away block no longer a working element');
  assert.deepEqual(locatePdf(view,left.blockId).pages,originalSplitSources.pages);cases++;
  // Full persistence: render, disk-reopen, replay, byte-identical all indices.
  const expected=exportMarkdown(view),opCount=view.delta.operations.length;
  const deltaFrozen=readFileSync(join(pkg,'changes.json'));
  assert.equal(cliRun('render',pkg,copyPdf,mdFile).status,'MOPJO_RENDER_OK');cases++;
  assert.equal(readFileSync(mdFile,'utf8'),expected);cases++;
  const another=open(JSON.parse(readFileSync(join(pkg,'original.dir.json'),'utf8')),
    JSON.parse(deltaFrozen.toString()),readFileSync(copyPdf));
  assert.equal(exportMarkdown(another),expected);cases++;
  assert.deepEqual(queryElements(another),queryElements(view),'every element and its source maps reproduce');cases++;
  expectRefusal({kind:'merge-text',leftBlockId:'blk_'+'0'.repeat(24),rightBlockId:target.blockId,
    detail:'invalid'},'unknown merge partner rejected');
  expectRefusal({kind:'split-text',blockId:target.blockId,offset:0,
    detail:'invalid'},'invalid split offset rejected');
  const staleMd=expectedView.replace(oldText,'stale human change');
  assert.throws(()=>importEditedMarkdown(view,staleMd),/STALE_MARKDOWN_VIEW/);cases++;
  const badDelta={...readDelta(),operations:[...readDelta().operations]};
  badDelta.operations[0]={...badDelta.operations[0],afterStateSha256:'0'.repeat(64)};
  assert.throws(()=>open(original,badDelta,pdfRaw),/OP_RESULT_MISMATCH/);cases++;
  assert.equal(readFileSync(join(pkg,'changes.json')).equals(deltaFrozen),true);cases++;
  assert.equal(sha256(readFileSync(join(pkg,'original.dir.json'))),sourceIrSha);cases++;
  assert.equal(sha256(readFileSync(copyIr)),sourceIrSha);cases++;
  assert.equal(sha256(readFileSync(copyPdf)),sourcePdfSha);cases++;
  assert.equal(sha256(readFileSync(realDirPath)),sourceIrSha);cases++;
  assert.equal(sha256(readFileSync(realPdfPath)),sourcePdfSha);cases++;
  check(!existsSync(join(pkg,'chapter.md')),'no cached Markdown becomes a new authority');
  console.log('MOPJO_WP2_BUFFETT_PASS',JSON.stringify({cases,blocksOriginal:original.blocks.length,
    blocksWorking:view.current.blocks.length,pages:original.pages.length,types:tally,
    operations:opCount,manualAdded:1,deletedAndRestored:1,splitAndMerged:1,
    originalDirSha256:sourceIrSha,pdfSha256:sourcePdfSha,
    replayMarkdownSha256:sha256(expected),pdfProvenanceIntact:true,
    richMetadataIndexed:true,immutableSources:true}));
}finally{rmSync(dir,{recursive:true,force:true});}
