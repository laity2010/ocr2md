/** WP3 chapter filesystem adapter. Never writes to V4 chapters; caller chooses a NEW output directory. */
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,renameSync,rmSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {sha256} from './core';
import {splitBook,encodeChapter,emptyChapterDelta,encodeChapterDelta,openChapter,
  chapterMarkdown,chapterElements,editChapterMarkdown,applyChapterOp,
  type ChapterOriginal,type ChapterDelta,type ChapterMapV1} from './chapters';
import {chapterSegmentIndex} from './chapterSegments';
import {chapterSourceEvidence,chapterAnnotationAudit,chapterPdfPoint,chapterMarkdownOffset,effectiveChapterTree} from './chapterLocate';
import {validateDocumentIrV1,encodeDocumentIrV1} from './ir/documentIrV1';
const enc=new TextEncoder();
const json=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
function files(directory:string,filename:string){
  if(filename.includes('/')||filename.includes('\\')||!filename.endsWith('.md'))
    throw Error('MOPJO CHAPTER_PATH_INVALID');
  const stem=filename.slice(0,-3),folder=join(resolve(directory),'chapters');
  return {original:join(folder,stem+'.dir.json'),delta:join(folder,stem+'.changes.json'),
    md:join(folder,filename)};
}
function load(directory:string,filename:string,pdfPath:string){
  const paths=files(directory,filename);
  const raw=readFileSync(paths.original),deltaRaw=readFileSync(paths.delta);
  const original=json(paths.original) as ChapterOriginal,delta=json(paths.delta) as ChapterDelta;
  const manifest=json(join(resolve(directory),'manifest.json'));
  const entry=manifest.chapters?.find((x:{fileName:string})=>x.fileName===filename);
  if(manifest.kind!=='mopjo/chapter-publication'||manifest.schemaVersion!==1||
    !entry||manifest.pdfSha256!==original.pdf.sha256||
    manifest.sourceBookIrSha256!==original.sourceBookIrSha256||
    manifest.mapSha256!==original.chapterMapSha256||
    manifest.baseGeneration!==original.baseGeneration||
    entry.originalSha256!==sha256(raw)||entry.chapterId!==original.chapterId||
    entry.startBlockId!==original.startBlockId||entry.endBlockId!==original.endBlockId||
    entry.originalBlockCount!==original.blocks.length||
    entry.sourceElementCount!==original.sourceElements.length||
    (entry.supplementalCount??0)!==(original.supplementalEvidence?.length??0))
    throw Error('MOPJO CHAPTER_MANIFEST_MISMATCH');
  if(sha256(raw)!==sha256(encodeChapter(original)))throw Error('MOPJO CHAPTER_BASELINE_BYTES_CHANGED');
  const doc=openChapter(original,delta,readFileSync(pdfPath));
  return {doc,deltaRaw,paths};
}
function updatedCopy(destination:string,next:Uint8Array,previous:Uint8Array){
  if(!readFileSync(destination).equals(Buffer.from(previous)))throw Error('MOPJO CHAPTER_DELTA_STALE');
  const folder=mkdtempSync(join(dirname(destination),'.mopjo-change-'));
  try{
    const staged=join(folder,'delta');writeFileSync(staged,next,{flag:'wx'});
    if(!readFileSync(destination).equals(Buffer.from(previous)))throw Error('MOPJO CHAPTER_DELTA_STALE');
    renameSync(staged,destination);
  }finally{rmSync(folder,{recursive:true,force:true});}
}
function writeDerivedMd(path:string,content:string){
  const folder=mkdtempSync(join(dirname(path),'.mopjo-md-'));
  try{const stage=join(folder,'projection.md');writeFileSync(stage,enc.encode(content),{flag:'wx'});
    renameSync(stage,path);
  }finally{rmSync(folder,{recursive:true,force:true});}
}
export function chapterCli(cmd:string,args:string[]):boolean {
  if(cmd==='chapter-publish'){
    if(args.length!==5)throw Error('usage: chapter-publish <original.dir.json> <chapters-map.json> <pdf> <baseGeneration> <NEW-output-directory>');
    const [irPath,mapPath,pdfPath,gen,output]=args;
    if(existsSync(output))throw Error('MOPJO CHAPTER_TARGET_EXISTS');
    const irRaw=readFileSync(irPath),ir=json(irPath),mapRaw=readFileSync(mapPath),map=json(mapPath) as ChapterMapV1;
    validateDocumentIrV1(ir);
    if(!irRaw.equals(Buffer.from(encodeDocumentIrV1(ir))))throw Error('MOPJO BOOK_BASELINE_NOT_CANONICAL');
    if(sha256(readFileSync(pdfPath))!==ir.pdf.sha256)throw Error('MOPJO CHAPTER_PDF_CHANGED');
    const chapters=splitBook(ir,map,gen,sha256(mapRaw));
    const parent=dirname(resolve(output)),staging=mkdtempSync(join(parent,'.mopjo-chapters-'));
    try{
      mkdirSync(join(staging,'chapters'));
      const entries=[];
      for(const original of chapters){
        const p=files(staging,original.filename),raw=encodeChapter(original);
        const delta=emptyChapterDelta(original),deltaRaw=encodeChapterDelta(delta);
        const doc=openChapter(original,delta);
        writeFileSync(p.original,raw,{flag:'wx'});
        writeFileSync(p.delta,deltaRaw,{flag:'wx'});
        writeFileSync(p.md,enc.encode(chapterMarkdown(doc)),{flag:'wx'});
        entries.push({fileName:original.filename,chapterId:original.chapterId,
          startBlockId:original.startBlockId,endBlockId:original.endBlockId,
          originalSha256:sha256(raw),markdownSha256:sha256(doc.markdown.content),
          originalBlockCount:original.blocks.length,sourceElementCount:original.sourceElements.length,
          supplementalCount:original.supplementalEvidence?.length??0});
      }
      const manifest={kind:'mopjo/chapter-publication',schemaVersion:1,
        sourceBookIrSha256:sha256(irRaw),mapSha256:sha256(mapRaw),baseGeneration:gen,
        pdfSha256:ir.pdf.sha256,chapters:entries,
        blockCount:entries.reduce((n,x)=>n+x.originalBlockCount,0),
        originalSourceElementCount:entries.reduce((n,x)=>n+x.sourceElementCount+x.supplementalCount,0)};
      if(manifest.originalSourceElementCount!==ir.sourceElements.length)
        throw Error('MOPJO CHAPTER_EVIDENCE_INCOMPLETE');
      if(manifest.blockCount!==ir.blocks.length)throw Error('MOPJO CHAPTER_LOST_BLOCKS');
      writeFileSync(join(staging,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
      // Read back every staged file before final rename. No original book path is writable.
      for(const e of entries){
        const p=files(staging,e.fileName);
        if(sha256(readFileSync(p.original))!==e.originalSha256||
           readFileSync(p.delta).length<30||
           !readFileSync(p.md,'utf8').startsWith('<!-- mopjo:chapter-state-sha256='))
          throw Error('MOPJO CHAPTER_STAGING_READBACK_FAILED');
      }
      if(existsSync(output))throw Error('MOPJO CHAPTER_TARGET_EXISTS');
      renameSync(staging,output);
      process.stdout.write(JSON.stringify({status:'MOPJO_CHAPTER_PUBLISH_OK',chapters:chapters.length,
        blocks:manifest.blockCount,sourceBookIrSha256:manifest.sourceBookIrSha256,
        pdfSha256:manifest.pdfSha256})+'\n');
    }finally{if(existsSync(staging))rmSync(staging,{recursive:true,force:true});}
    return true;
  }
  if(['chapter-render','chapter-elements','chapter-evidence','chapter-notes','chapter-tree',
      'chapter-point','chapter-offset','chapter-segments','chapter-edit','chapter-operate'].includes(cmd)){
    const expected=cmd==='chapter-edit'||cmd==='chapter-operate'?4:
      cmd==='chapter-offset'?4:cmd==='chapter-point'?6:3;
    if(args.length!==expected)throw Error(`usage: ${cmd} <package-directory> <chapter-filename.md> <original.pdf> ${expected===4?'<edit.md | operation.json>':''}`);
    const {doc,deltaRaw,paths}=load(args[0],args[1],args[2]);
    if(cmd==='chapter-render'){
      // Reconcile projection cache from the authoritative pair, including crash recovery.
      writeDerivedMd(paths.md,chapterMarkdown(doc));
      process.stdout.write(JSON.stringify({status:'MOPJO_CHAPTER_RENDER_OK',sha256:sha256(doc.markdown.content),
        blocks:doc.markdown.ranges.length,operations:doc.delta.operations.length})+'\n');
    }else if(cmd==='chapter-elements'){
      process.stdout.write(JSON.stringify({status:'MOPJO_CHAPTER_ELEMENTS_OK',elements:chapterElements(doc)})+'\n');
    }else if(cmd==='chapter-evidence'){
      process.stdout.write(JSON.stringify({status:'MOPJO_CHAPTER_EVIDENCE_OK',elements:chapterSourceEvidence(doc)})+'\n');
    }else if(cmd==='chapter-segments'){
      process.stdout.write(JSON.stringify({status:'MOPJO_CHAPTER_SEGMENTS_OK',
        segments:chapterSegmentIndex(doc)})+'\n');
    }else if(cmd==='chapter-notes'){
      process.stdout.write(JSON.stringify({status:'MOPJO_CHAPTER_NOTES_OK',notes:chapterAnnotationAudit(doc)})+'\n');
    }else if(cmd==='chapter-tree'){
      process.stdout.write(JSON.stringify({status:'MOPJO_CHAPTER_TREE_OK',tree:effectiveChapterTree(doc)})+'\n');
    }else if(cmd==='chapter-point'){
      process.stdout.write(JSON.stringify(chapterPdfPoint(doc,Number(args[3]),Number(args[4]),Number(args[5])))+'\n');
    }else if(cmd==='chapter-offset'){
      process.stdout.write(JSON.stringify(chapterMarkdownOffset(doc,Number(args[3])))+'\n');
    }else{
      const next=cmd==='chapter-edit'?editChapterMarkdown(doc,readFileSync(args[3],'utf8')):
        applyChapterOp(doc,json(args[3]));
      updatedCopy(paths.delta,encodeChapterDelta(next.delta),deltaRaw);
      // This MD is always derived; if interrupted between writes, chapter-render regenerates it.
      writeDerivedMd(paths.md,chapterMarkdown(next));
      process.stdout.write(JSON.stringify({status:'MOPJO_CHAPTER_UPDATE_OK',
        operations:next.delta.operations.length,sha256:sha256(next.markdown.content)})+'\n');
    }
    return true;
  }
  return false;
}
