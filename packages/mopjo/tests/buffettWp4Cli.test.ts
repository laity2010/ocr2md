/** WP4 CLI tests: one real book, fresh isolated package, persisted delta and reread. */
import * as assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {sha256} from '../src/core';
import {chapterMarkdown,openChapter} from '../src/chapters';
const [irPath,mapPath,pdfPath,gen]=process.argv.slice(2);
if(!gen)throw Error('usage: WP4 CLI <ir> <map> <PDF> <generation>');
const srcHashes=[irPath,mapPath,pdfPath].map(x=>sha256(readFileSync(x)));
const temp=mkdtempSync(join(tmpdir(),'mopjo-wp4-cli-'));
const pkg=join(temp,'package'),cli=resolve(process.cwd(),'dist/cli.mjs');
const exec=(...args:string[])=>JSON.parse(execFileSync(process.execPath,[cli,...args],
  {encoding:'utf8',maxBuffer:32*1024*1024}));
const fail=(...args:string[])=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
let cases=0;
const check=(v:unknown,s:string)=>{assert.ok(v,s);cases++;};
const eq=(a:unknown,b:unknown,s:string)=>{assert.deepEqual(a,b,s);cases++;};
try{
  const pub=exec('chapter-publish',irPath,mapPath,pdfPath,gen,pkg);
  eq(pub.chapters,6,'six real isolated chapters');
  eq(pub.blocks,224,'224 complete block coverage');
  const manifest=JSON.parse(readFileSync(join(pkg,'manifest.json'),'utf8'));
  eq(manifest.originalSourceElementCount,315,'all 315 original OCR element ids in serialized chapters');
  eq(manifest.chapters.reduce((n:number,c:{supplementalCount:number})=>n+c.supplementalCount,0),91,
    '91 excluded OCR evidence persisted in supplemental sections');
  const name=manifest.chapters[1].fileName as string,stem=name.slice(0,-3);
  const chapterOriginal=join(pkg,'chapters',stem+'.dir.json'),delta=join(pkg,'chapters',stem+'.changes.json');
  const originalBytes=readFileSync(chapterOriginal),initialDelta=readFileSync(delta);
  const elementResponse=exec('chapter-elements',pkg,name,pdfPath);
  eq(elementResponse.status,'MOPJO_CHAPTER_ELEMENTS_OK','CLI chapter elements');
  const a=elementResponse.elements.find((x:{type:string;text:string;pdfRegions:unknown[]})=>
    x.type==='text'&&x.text.length>75&&x.pdfRegions.length===1)!;
  check(Boolean(a),'real text element for CLI operations');
  const opFile=join(temp,'operation.json');
  const writeOp=(o:unknown)=>writeFileSync(opFile,JSON.stringify(o));
  const write=(o:unknown)=>{writeOp(o);return exec('chapter-operate',pkg,name,pdfPath,opFile)};
  eq(write({kind:'split-text',blockId:a.blockId,offset:25}).operations,1,'CLI split saved');
  let updated=exec('chapter-elements',pkg,name,pdfPath).elements;
  const i=updated.findIndex((e:{blockId:string})=>e.blockId===a.blockId);
  const newId=updated[i+1].blockId as string;
  eq(updated[i].text+updated[i+1].text,a.text,'CLI split exact text');
  eq(write({kind:'merge-text',blockId:a.blockId,otherBlockId:newId,separator:''}).operations,2,
    'CLI merge saved');
  updated=exec('chapter-elements',pkg,name,pdfPath).elements;
  eq(updated.find((e:{blockId:string})=>e.blockId===a.blockId).text,a.text,
    'CLI merge restored original OCR paragraph');
  const notes=exec('chapter-notes',pkg,name,pdfPath);
  eq(notes.notes.length,1,'original PDF page-2 physical footnote accessible by chapter CLI');
  eq(notes.notes[0].status,'needs-review','not auto paired');
  const noteAnchor=updated.find((x:{pdfPages:number[];type:string})=>x.type==='text'&&x.pdfPages.includes(2))!;
  eq(write({kind:'review-note',blockId:noteAnchor.blockId,
    noteElementId:notes.notes[0].noteElementId,decision:'unmatched',noteNumber:null,
    detail:'WP4 CLI inspection only: physical note attribution remains unverified'}).operations,3,
    'chapter note review saved');
  eq(exec('chapter-notes',pkg,name,pdfPath).notes[0].status,'reviewed','delta note audit reread');
  const r=a.pdfRegions[0],bb=r.normalizedBBox;
  const p=exec('chapter-point',pkg,name,pdfPath,String(r.page),
    String((bb[0]+bb[2])/2),String((bb[1]+bb[3])/2));
  check(p.matches.some((x:{blockId:string})=>x.blockId===a.blockId),
    'PDF point locates CLI-updated element');
  const at=exec('chapter-elements',pkg,name,pdfPath).elements.find((x:{blockId:string})=>x.blockId===a.blockId);
  const md=exec('chapter-offset',pkg,name,pdfPath,String(at.markdownRange.from+1));
  eq(md.hit?.blockId,a.blockId,'MD offset locates CLI-updated element');
  const segments=exec('chapter-segments',pkg,name,pdfPath);
  check(segments.segments.length>elementResponse.elements.length,
    'CLI returns segment-level pointers beyond logical block count');
  check(segments.segments.some((s:{kind:string;segmentPointer:string})=>
    s.kind==='inline_equation'&&s.segmentPointer.startsWith('/pdf_info/')),
    'CLI includes real inline math source pointers');
  eq(segments.status,'MOPJO_CHAPTER_SEGMENTS_OK','segment index CLI accessible');
  check(segments.segments.some((x:{blockId:string;page:number;segmentPointer:string})=>
    x.blockId===a.blockId&&x.page>0&&x.segmentPointer.startsWith('/pdf_info/')),
    'segment-level source identity and true PDF page retained');
  check(segments.segments.every((x:{resolution:string;markdownRange:unknown})=>
    x.resolution==='unique-source-text'||x.markdownRange===null),
    'ambiguous OCR segment never invents Markdown range');
  const evidence=exec('chapter-evidence',pkg,name,pdfPath);
  check(evidence.elements.some((x:{type:string})=>x.type==='page_footnote'),
    'unmodified physical page footnote is independently queryable');
  const tree=exec('chapter-tree',pkg,name,pdfPath);
  check(tree.tree.length>=5,'independent chapter tree query works');
  const dirDoc=JSON.parse(originalBytes.toString());
  const current=openChapter(dirDoc,JSON.parse(readFileSync(delta,'utf8')),readFileSync(pdfPath));
  const valid=readFileSync(join(pkg,'chapters',name),'utf8');
  eq(valid,chapterMarkdown(current),'MD cache matches JSON+delta reconstruction after CLI edits');
  const badJson=readFileSync(delta);writeOp({kind:'replace-rich',blockId:a.blockId,
    elementId:'fake',segmentPointer:'fake',from:0,before:'A',after:'B'});
  check(fail('chapter-operate',pkg,name,pdfPath,opFile).status!==0,'forged rich source rejected');
  check(readFileSync(delta).equals(badJson),'failed CLI request never alters persistent delta');
  eq(sha256(readFileSync(chapterOriginal)),sha256(originalBytes),'chapter original immutable');
  check(!readFileSync(delta).equals(initialDelta),'only delta changed on successful edits');
  eq([irPath,mapPath,pdfPath].map(x=>sha256(readFileSync(x))),srcHashes,
    'all real Buffett inputs remain read-only');
  console.log('MOPJO_WP4_CLI_PASS',JSON.stringify({cases,chapters:6,evidence:315,
    persistedOps:current.delta.operations.length,sourceImmutable:true,reopened:true}));
}finally{rmSync(temp,{recursive:true,force:true});}
