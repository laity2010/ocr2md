/** WP05: actual V4 book input, isolated file-backed ChapterPort, zero writes to book. */
import * as assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync,mkdtempSync,rmSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {sha256} from '../src/core';
import {splitBook,encodeChapter,encodeChapterDelta,emptyChapterDelta,
  type ChapterMapV1} from '../src/chapters';
import {MopjoV4ChapterSession,type V4ChapterPort,MOPJO_V4_PORT_VERSION} from '../src/v4Port';
const [irPath,mapPath,pdfPath,generation]=process.argv.slice(2);
if(!generation)throw Error('usage: WP05 <book IR> <chapter map> <PDF> <generation>');
const irBytes=readFileSync(irPath),mapBytes=readFileSync(mapPath),pdf=readFileSync(pdfPath);
const readOnlyHashes=[irBytes,mapBytes,pdf].map(sha256);
const book=JSON.parse(irBytes.toString()),map=JSON.parse(mapBytes.toString()) as ChapterMapV1;
const chapters=splitBook(book,map,generation,sha256(mapBytes));
const dir=mkdtempSync(join(tmpdir(),'mopjo-v4-port-'));
let checks=0, commits=0;
function eq(a:unknown,b:unknown,message:string){
  assert.deepEqual(a,b,message);checks++;
}
function ok(a:unknown,message:string){assert.ok(a,message);checks++;}
class FileChapterPort implements V4ChapterPort {
  readonly names=chapters.map(c=>c.filename);
  readonly baselines=new Map<string,Buffer>();
  constructor(readonly root:string){
    mkdirSync(root,{recursive:true});
    for(const ch of chapters){
      const original=Buffer.from(encodeChapter(ch));
      this.baselines.set(ch.filename,original);
      writeFileSync(join(root,ch.filename.slice(0,-3)+'.dir.json'),original,{flag:'wx'});
      writeFileSync(join(root,ch.filename.slice(0,-3)+'.changes.json'),
        encodeChapterDelta(emptyChapterDelta(ch)),{flag:'wx'});
    }
  }
  async listChapters(){return this.names;}
  async readChapter(name:string){
    if(!this.names.includes(name))throw Error('MOPJO PORT_UNKNOWN_CHAPTER');
    return {original:readFileSync(join(this.root,name.slice(0,-3)+'.dir.json')),
      delta:readFileSync(join(this.root,name.slice(0,-3)+'.changes.json')),pdf};
  }
  async commitDelta(name:string,expected:Uint8Array,updated:Uint8Array){
    if(!this.names.includes(name))throw Error('MOPJO PORT_UNKNOWN_CHAPTER');
    const path=join(this.root,name.slice(0,-3)+'.changes.json');
    if(!readFileSync(path).equals(Buffer.from(expected)))throw Error('MOPJO PORT_CAS_STALE');
    const tmp=path+'.pending';
    if(existsSync(tmp))throw Error('MOPJO PORT_IN_PROGRESS');
    writeFileSync(tmp,updated,{flag:'wx'});
    try{
      // This isolated fixture has one writer. Production must provide true server-side atomic CAS.
      if(!readFileSync(path).equals(Buffer.from(expected)))throw Error('MOPJO PORT_CAS_STALE');
      renameSync(tmp,path);commits++;
    }finally{if(existsSync(tmp))rmSync(tmp);}
  }
}
async function main(){
try{
  const port=new FileChapterPort(join(dir,'chapter-data'));
  const names=await MopjoV4ChapterSession.list(port);
  eq(names.length,6,'V4 published six chapter files');
  eq(MOPJO_V4_PORT_VERSION,1,'stable versioned port');
  let total=0,source=0,unverified=0;
  for(const name of names){
    const session=await MopjoV4ChapterSession.open(port,name);
    total+=session.elements().length;
    source+=session.evidence().length;
    unverified+=session.evidence().filter(e=>e.role==='page-proximity-unverified').length;
    eq(session.summary().dirty,false,'new chapter is clean');
    ok(session.markdown().startsWith('<!-- mopjo:chapter-state-sha256='),'projection header valid');
    ok(session.summary().headerUtf16Length>0,'full Markdown offsets include state header');
  }
  eq(total,224,'all logical blocks are available without opening book IR again');
  eq(source,315,'all original source elements preserved');
  eq(unverified,91,'discarded evidence is visible but unverified');
  const name=names[1];
  const a=await MopjoV4ChapterSession.open(port,name);
  const b=await MopjoV4ChapterSession.open(port,name);
  const md=a.markdown(),state=a.summary();
  const element=a.elements().find(e=>e.type==='text'&&e.markdownRange&&
    e.currentMarkdownContent.length>50&&e.pdfRegions.length===1)!;
  ok(Boolean(element),'real text element with OCR evidence');
  const r=element.markdownRange!;
  eq(md.slice(r.from,r.to),element.currentMarkdownContent,'AG element points at exact full MD text');
  eq(a.markdownOffset(r.from+1).hit?.blockId,element.blockId,'CodeMirror offset maps to stable block');
  eq(a.markdownOffset(0).kind,'unmatched','state header has no fabricated PDF source');
  const evidence=element.pdfRegions[0],norm=evidence.normalizedBBox;
  const point=a.pdfPoint(evidence.page,(norm[0]+norm[2])/2,(norm[1]+norm[3])/2);
  ok(point.matches.some(hit=>hit.blockId===element.blockId),'PDF point resolves real block');
  const own=point.matches.find(hit=>hit.blockId===element.blockId)!;
  eq(own.markdownRange?.from,r.from,'PDF to full MD offset includes version header');
  ok(a.segments().length>0,'original OCR segment data is queryable');
  ok(a.tree().length>0,'chapter tree derived from current data');
  ok(a.notes().length>0,'physical note evidence available, no automatic pairing');
  const changed=md.slice(0,r.to)+' [WP05 reviewed]'+md.slice(r.to);
  a.editMarkdown(changed);
  eq(a.summary().dirty,true,'edited markdown held as draft');
  eq(commits,0,'no storage write before explicit save');
  eq(a.summary().deltaRevision,state.deltaRevision,'revision only advances on save');
  assert.throws(()=>a.editMarkdown(md),/MOPJO CHAPTER_STALE_MARKDOWN/);checks++;
  const saved=await a.save();
  eq(saved.dirty,false,'explicit delta save succeeds');
  eq(saved.operations,1,'edit stored as one semantic operation');
  eq(commits,1,'only one delta commit');
  eq(a.markdown(),changed.replace(
    /^<!-- mopjo:chapter-state-sha256=[a-f0-9]{64} -->/,
    '<!-- mopjo:chapter-state-sha256='+saved.stateSha256+' -->'),'projection is deterministic');
  const reopened=await MopjoV4ChapterSession.open(port,name);
  eq(reopened.markdown(),a.markdown(),'after restart JSON replay yields exact Markdown');
  eq(reopened.summary().stateSha256,saved.stateSha256,'reopened state digest matches');
  eq(reopened.elements().find(x=>x.blockId===element.blockId)?.pdfRegions,
    element.pdfRegions,'original PDF provenance preserved after editing');
  assert.throws(()=>a.editMarkdown(md),/MOPJO CHAPTER_STALE_MARKDOWN/);checks++;
  // Second editor used the same baseline. Its CAS cannot overwrite the first editor.
  const other=b.elements().find(e=>e.type==='text'&&e.blockId!==element.blockId)!;
  b.operate({kind:'suppress',blockId:other.blockId});
  await assert.rejects(()=>b.save(),/MOPJO PORT_CAS_STALE/);checks++;
  eq(b.summary().dirty,true,'CAS rejection retains a recoverable local draft');
  eq((await MopjoV4ChapterSession.open(port,name)).markdown(),a.markdown(),
    'conflicting editor cannot change persisted data');
  b.discardDraft();
  eq(b.summary().dirty,false,'discard resets only local draft');
  const draft=await MopjoV4ChapterSession.open(port,name);
  draft.operate({kind:'suppress',blockId:other.blockId});
  eq(draft.elements().find(e=>e.blockId===other.blockId)?.hidden,true,'semantic operation updates AG');
  eq(draft.summary().dirty,true,'semantic operation marks dirty');
  draft.discardDraft();
  eq(draft.elements().find(e=>e.blockId===other.blockId)?.hidden,false,'discard restores AG');
  eq(commits,1,'discard cannot write delta');
  // UI cannot edit, discard, or race another save while a commit is in flight.
  let releaseCommit:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{releaseCommit=resolve;});
  const slowPort:V4ChapterPort={
    listChapters:()=>port.listChapters(),
    readChapter:name=>port.readChapter(name),
    commitDelta:async (name,expected,updated)=>{
      await gate;
      return port.commitDelta(name,expected,updated);
    }
  };
  const held=await MopjoV4ChapterSession.open(slowPort,name);
  held.operate({kind:'suppress',blockId:other.blockId});
  const pending=held.save();
  eq(held.summary().saving,true,'UI save-in-flight state exposed');
  assert.throws(()=>held.discardDraft(),/MOPJO V4_SAVE_IN_PROGRESS/);checks++;
  assert.throws(()=>held.operate({kind:'restore',blockId:other.blockId}),
    /MOPJO V4_SAVE_IN_PROGRESS/);checks++;
  await assert.rejects(()=>held.save(),/MOPJO V4_SAVE_IN_PROGRESS/);checks++;
  releaseCommit();
  eq((await pending).dirty,false,'held save commits exact previous draft');
  eq(commits,2,'two explicit saves, never an implicit save');
  // Security: path crossing is rejected before store invocation.
  await assert.rejects(()=>MopjoV4ChapterSession.open(port,'../illegal.md'),
    /MOPJO V4_CHAPTER_FILENAME_INVALID/);checks++;
  const alteredPdfPort:V4ChapterPort={...port,
    listChapters:()=>port.listChapters(),
    commitDelta:(...args)=>port.commitDelta(...args),
    readChapter:async file=>({...await port.readChapter(file),pdf:Buffer.from('not original PDF')})};
  await assert.rejects(()=>MopjoV4ChapterSession.open(alteredPdfPort,name),
    /MOPJO CHAPTER_PDF_CHANGED/);checks++;
  const tamperedPort:V4ChapterPort={
    listChapters:()=>port.listChapters(),
    commitDelta:(...args)=>port.commitDelta(...args),
    readChapter:async file=>{
      const data=await port.readChapter(file);
      const copy=JSON.parse(Buffer.from(data.original).toString());
      copy.label+=' corrupted';
      return {...data,original:Buffer.from(JSON.stringify(copy))};
    }
  };
  await assert.rejects(()=>MopjoV4ChapterSession.open(tamperedPort,name),
    /MOPJO V4_CHAPTER_BASELINE_MISMATCH/);checks++;
  // Source input and every immutable per-chapter baseline are unchanged after operations.
  eq([readFileSync(irPath),readFileSync(mapPath),readFileSync(pdfPath)].map(sha256),
    readOnlyHashes,'real V4 Buffett source files unchanged');
  for(const [file,baseline] of port.baselines)
    eq(readFileSync(join(port.root,file.slice(0,-3)+'.dir.json')),baseline,'immutable chapter baseline intact');
  eq(await MopjoV4ChapterSession.list(port),names,'chapter catalog preserved');
  console.log('MOPJO_WP5_V4_PORT_PASS',JSON.stringify({checks,chapters:names.length,
    sourceElements:source,unverified,originalBlocks:total,
    writesToDelta:commits,immutableSource:true,reopened:true,casConflictRejected:true,
    fullMarkdownOffsets:true}));
}finally{rmSync(dir,{recursive:true,force:true});}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
