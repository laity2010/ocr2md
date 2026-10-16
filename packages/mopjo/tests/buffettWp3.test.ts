/** WP3 acceptance with V4's actual Buffett IR, chapter-map, original PDF.
 * User files strictly read-only; every generated package and edit lives in OS tmp.
 */
import * as assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,copyFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {openChapter,chapterMarkdown,chapterElements,encodeChapter,validateChapter,
  type ChapterOriginal,type ChapterDelta} from '../src/chapters';
import {sha256} from '../src/core';
const [irPath,mapPath,pdfPath,baseGeneration]=process.argv.slice(2);
if(!irPath||!mapPath||!pdfPath||!baseGeneration)throw Error('usage: WP3 <saved IR> <saved map> <bound PDF> <current ZIP generation>');
const sourceIr=readFileSync(irPath),sourceMap=readFileSync(mapPath),sourcePdf=readFileSync(pdfPath);
const irSha=sha256(sourceIr),mapSha=sha256(sourceMap),pdfSha=sha256(sourcePdf);
const ir=JSON.parse(sourceIr.toString());const map=JSON.parse(sourceMap.toString());
const expectedNames=map.markings.segments.map((s:{fileName:string})=>s.fileName);
const temp=mkdtempSync(join(tmpdir(),'mopjo-wp3-buffett-'));
const cli=resolve(process.cwd(),'dist/cli.mjs');
const cmd=(...args:string[])=>JSON.parse(execFileSync(process.execPath,[cli,...args],
  {encoding:'utf8',maxBuffer:20*1024*1024}));
const rejected=(...args:string[])=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
const folder=join(temp,'release'),chapterFile=expectedNames[1];
const stem=chapterFile.slice(0,-3);
const chPath=join(folder,'chapters',stem+'.dir.json');
const deltaPath=join(folder,'chapters',stem+'.changes.json');
const mdPath=join(folder,'chapters',chapterFile);
let n=0;
const check=(ok:unknown,msg:string)=>{assert.ok(ok,msg);n++;};
try{
  assert.equal(cmd('chapter-publish',irPath,mapPath,pdfPath,baseGeneration,folder).status,
    'MOPJO_CHAPTER_PUBLISH_OK');n++;
  const manifest=JSON.parse(readFileSync(join(folder,'manifest.json'),'utf8'));
  check(manifest.chapters.length===6&&manifest.blockCount===224,'6 actual V4 file boundaries and complete 224 blocks');
  assert.deepEqual(manifest.chapters.map((c:{fileName:string})=>c.fileName),expectedNames);n++;
  const expectedBlocks=ir.blocks.map((b:{blockId:string})=>b.blockId);
  const actualBlocks:string[]=[],allSources=new Set<string>(),allOutline=new Set<string>();
  const initialMds=new Map<string,string>();
  const packageSizes:number[]=[];
  for(const entry of manifest.chapters){
    const s=entry.fileName.slice(0,-3);
    const originalPath=join(folder,'chapters',s+'.dir.json');
    const delta=JSON.parse(readFileSync(join(folder,'chapters',s+'.changes.json'),'utf8')) as ChapterDelta;
    const sourceBytes=readFileSync(originalPath),chapter=JSON.parse(sourceBytes.toString()) as ChapterOriginal;
    const cached=readFileSync(join(folder,'chapters',entry.fileName),'utf8');
    validateChapter(chapter);
    assert.equal(sha256(sourceBytes),entry.originalSha256);n++;
    assert.equal(chapter.sourceBookIrSha256,irSha);n++;
    assert.equal(chapter.chapterMapSha256,mapSha);n++;
    assert.equal(chapter.pdf.sha256,pdfSha);n++;
    const reopened=openChapter(chapter,delta,sourcePdf);
    assert.equal(chapterMarkdown(reopened),cached);n++;
    check(chapter.sourceElements.length>0&&chapter.blocks.length===entry.originalBlockCount,
      'valid original elements for '+s);
    check(sourceBytes.length<sourceIr.length,'chapter baseline smaller than book IR '+s);
    packageSizes.push(sourceBytes.length);
    for(const b of chapter.blocks)actualBlocks.push(b.block.blockId);
    for(const outline of chapter.chapterTree)allOutline.add(outline.chapterId);
    for(const e of chapter.sourceElements)allSources.add(e.id);
    const elems=chapterElements(reopened);
    check(elems.every(e=>e.pdfPages.length>0&&e.markdownRange!==null),
      'chapter source mapping all blocks '+s);
    check(elems.every(e=>e.pdfRegions.every(region=>region.page>=1&&region.page<=22)),
      'global PDF page numbering '+s);
    initialMds.set(entry.fileName,cached);
  }
  assert.equal(new Set(actualBlocks).size,224);n++;
  assert.deepEqual(actualBlocks,expectedBlocks,'strict order/coverage 224: each block exactly once');n++;
  check(allSources.size===ir.blocks.length,'all referenced source elements represented');
  check(allOutline.size===ir.chapters.length,'all 19 nested chapter headings preserved across files');
  check(!existsSync(join(folder,'original.pdf')),'no PDF duplicate in published package');
  // Important: no whole book snapshot needed to edit/reopen this chapter.
  const chapterBaseline=readFileSync(chPath),chapterSha=sha256(chapterBaseline);
  const bookIrBefore=readFileSync(irPath),mapBefore=readFileSync(mapPath),pdfBefore=readFileSync(pdfPath);
  const isolated=join(temp,'one-chapter-only');
  const isolatedFile=join(temp,'scratch.md'),isolatedOriginal=join(temp,'one.dir.json'),isolatedDelta=join(temp,'one.changes.json');
  copyFileSync(chPath,isolatedOriginal);copyFileSync(deltaPath,isolatedDelta);
  // Test only packaged files: original entire-book IR and map are not referenced below.
  let doc=openChapter(JSON.parse(readFileSync(isolatedOriginal,'utf8')),
    JSON.parse(readFileSync(isolatedDelta,'utf8')),sourcePdf);
  const oldMd=chapterMarkdown(doc),firstText=chapterElements(doc).find(e=>e.type==='text'&&e.text.length>50)!;
  check(Boolean(firstText),'found real Buffett chapter body block');
  const loc=firstText.pdfRegions;
  const before=doc.markdown.content.slice(firstText.markdownRange!.from,firstText.markdownRange!.to);
  const edited=oldMd.replace(before,before+' [MOPJO WP3 VERIFIED]');
  writeFileSync(isolatedFile,edited);
  assert.equal(cmd('chapter-edit',folder,chapterFile,pdfPath,isolatedFile).status,
    'MOPJO_CHAPTER_UPDATE_OK');n++;
  doc=openChapter(JSON.parse(readFileSync(chPath,'utf8')),
    JSON.parse(readFileSync(deltaPath,'utf8')),sourcePdf);
  check(chapterMarkdown(doc)===readFileSync(mdPath,'utf8'),'edited chapter cache synchronized');
  check(chapterElements(doc).find(e=>e.blockId===firstText.blockId)?.text.endsWith('[MOPJO WP3 VERIFIED]'),
    'Markdown change became chapter delta');
  assert.deepEqual(chapterElements(doc).find(e=>e.blockId===firstText.blockId)?.pdfRegions,loc);n++;
  const opFile=join(temp,'op.json');writeFileSync(opFile,JSON.stringify({kind:'suppress',blockId:firstText.blockId}));
  assert.equal(cmd('chapter-operate',folder,chapterFile,pdfPath,opFile).status,
    'MOPJO_CHAPTER_UPDATE_OK');n++;
  doc=openChapter(JSON.parse(readFileSync(chPath,'utf8')),
    JSON.parse(readFileSync(deltaPath,'utf8')),sourcePdf);
  check(chapterElements(doc).find(e=>e.blockId===firstText.blockId)?.hidden,'suppressed from chapter MD');
  check(chapterElements(doc).find(e=>e.blockId===firstText.blockId)?.markdownRange===null,
    'no fake MD range for suppressed element');
  assert.deepEqual(chapterElements(doc).find(e=>e.blockId===firstText.blockId)?.pdfRegions,loc);n++;
  writeFileSync(opFile,JSON.stringify({kind:'restore',blockId:firstText.blockId}));
  assert.equal(cmd('chapter-operate',folder,chapterFile,pdfPath,opFile).status,
    'MOPJO_CHAPTER_UPDATE_OK');n++;
  const parentDoc=openChapter(JSON.parse(readFileSync(chPath,'utf8')),
    JSON.parse(readFileSync(deltaPath,'utf8')),sourcePdf);
  check(chapterMarkdown(parentDoc).includes('[MOPJO WP3 VERIFIED]'),'restored correction preserved');
  const anchor=chapterElements(parentDoc).find(e=>e.type==='text'&&e.pdfPages.length&&e.blockId!==firstText.blockId)!;
  writeFileSync(opFile,JSON.stringify({kind:'insert-manual-text',blockId:anchor.blockId,
    text:'Buffett chapter manual transcription WP3',page:anchor.pdfPages[0]}));
  assert.equal(cmd('chapter-operate',folder,chapterFile,pdfPath,opFile).status,
    'MOPJO_CHAPTER_UPDATE_OK');n++;
  const finalDoc=openChapter(JSON.parse(readFileSync(chPath,'utf8')),
    JSON.parse(readFileSync(deltaPath,'utf8')),sourcePdf);
  const manual=chapterElements(finalDoc).find(e=>e.text==='Buffett chapter manual transcription WP3')!;
  check(manual.pdfRegions.length===0&&manual.manualPage===anchor.pdfPages[0]&&manual.originalElementIds.length===0,
    'new human text has page only, no invented OCR/PDF box');
  check(finalDoc.delta.operations.length===4,'edit/delete/restore/insert replayed');
  assert.equal(chapterMarkdown(finalDoc),readFileSync(mdPath,'utf8'));n++;
  assert.equal(cmd('chapter-render',folder,chapterFile,pdfPath).status,
    'MOPJO_CHAPTER_RENDER_OK');n++;
  assert.equal(readFileSync(mdPath,'utf8'),chapterMarkdown(finalDoc));n++;
  // Cached MD is never authoritative: it can be repaired entirely from the pair.
  writeFileSync(mdPath,'stale wrong cached Markdown');
  assert.equal(cmd('chapter-render',folder,chapterFile,pdfPath).status,'MOPJO_CHAPTER_RENDER_OK');n++;
  check(readFileSync(mdPath,'utf8')===chapterMarkdown(finalDoc),'stale projection rebuilt, not trusted');
  // Tampering the delta fails without ever writing a generated MD.
  const originalDelta=readFileSync(deltaPath),badDelta=JSON.parse(originalDelta.toString());
  badDelta.operations[0].afterSha256='0'.repeat(64);
  writeFileSync(deltaPath,JSON.stringify(badDelta,null,2)+'\n');
  const rejectedDelta=rejected('chapter-render',folder,chapterFile,pdfPath);
  check(rejectedDelta.status!==0&&rejectedDelta.stderr.includes('CHAPTER_OP_RESULT_MISMATCH'),
    'corrupt delta operation chain refused');
  writeFileSync(deltaPath,originalDelta);
  // Damaged original, wrong PDF, stale MD and invalid map must fail closed.
  const staleFile=join(temp,'stale.md');writeFileSync(staleFile,oldMd.replace(before,'unsafe stale edit'));
  const dRaw=readFileSync(deltaPath);
  const stale=rejected('chapter-edit',folder,chapterFile,pdfPath,staleFile);
  check(stale.status!==0&&stale.stderr.includes('CHAPTER_STALE_MARKDOWN'),'stale MD rejected');
  const wrongPdf=join(temp,'wrong.pdf'),badPdf=Buffer.from(sourcePdf);badPdf[100]^=1;writeFileSync(wrongPdf,badPdf);
  const wrong=rejected('chapter-render',folder,chapterFile,wrongPdf);
  check(wrong.status!==0&&wrong.stderr.includes('CHAPTER_PDF_CHANGED'),'wrong PDF rejected');
  check(readFileSync(deltaPath).equals(dRaw),'rejected attempts have no delta side effect');
  const altered=JSON.parse(chapterBaseline.toString());altered.label+=' forged';
  writeFileSync(chPath,JSON.stringify(altered,null,2)+'\n');
  const bad=rejected('chapter-render',folder,chapterFile,pdfPath);
  check(bad.status!==0&&bad.stderr.includes('CHAPTER_MANIFEST_MISMATCH'),
    'manifest detects tampered original chapter even when structured data re-serializes');
  writeFileSync(chPath,chapterBaseline);
  const wrongMap=join(temp,'bad-map.json'),broken=structuredClone(map);
  broken.markings.segments[0].endBlockId=broken.markings.segments[0].startBlockId;
  writeFileSync(wrongMap,JSON.stringify(broken));
  const incorrect=rejected('chapter-publish',irPath,wrongMap,pdfPath,baseGeneration,join(temp,'nope'));
  check(incorrect.status!==0&&!existsSync(join(temp,'nope')),'invalid/noncontiguous map rejected');
  const collision=rejected('chapter-publish',irPath,mapPath,pdfPath,baseGeneration,folder);
  check(collision.status!==0,'refuses overwriting existing packages');
  check(sha256(readFileSync(irPath))===irSha&&bookIrBefore.equals(readFileSync(irPath)),'whole book IR untouched');
  check(sha256(readFileSync(mapPath))===mapSha&&mapBefore.equals(readFileSync(mapPath)),'V4 boundary map untouched');
  check(sha256(readFileSync(pdfPath))===pdfSha&&pdfBefore.equals(readFileSync(pdfPath)),'same original PDF untouched');
  check(sha256(readFileSync(chPath))===chapterSha,'chapter immutable original unchanged after four edits');
  check(initialMds.size===6&&statSync(mdPath).size>50&&packageSizes.every(x=>x>1000),
    'six generated MD and independent detailed originals');
  console.log('MOPJO_WP3_BUFFETT_PASS',JSON.stringify({checks:n,chapters:manifest.chapters.length,
    originalBlocks:224,coveredBlocks:actualBlocks.length,sourceElements:allSources.size,
    preservedOutlineNodes:allOutline.size,chapterBlockCounts:manifest.chapters.map((x:{originalBlockCount:number})=>x.originalBlockCount),
    originalChapterBytes:packageSizes,originalBookBytes:sourceIr.length,
    editedChapter:chapterFile,operations:finalDoc.delta.operations.length,
    originalBookSha256:irSha,sourceMapSha256:mapSha,pdfSha256:pdfSha,
    independentOpen:true,pdfProvenanceUnchanged:true,shaIntact:true}));
}finally{rmSync(temp,{recursive:true,force:true});}
