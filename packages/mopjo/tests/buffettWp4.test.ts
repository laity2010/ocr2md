/** WP4 end-to-end real Buffett IR assertions, never writes user files. */
import * as assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {sha256} from '../src/core';
import {splitBook,emptyChapterDelta,openChapter,applyChapterOp,chapterMarkdown,
  chapterElements,encodeChapterDelta,editChapterMarkdown,type OpenChapter} from '../src/chapters';
import {chapterSegmentIndex} from '../src/chapterSegments';
import {chapterPdfPoint,chapterMarkdownOffset,chapterSourceEvidence,
  chapterAnnotationAudit,effectiveChapterTree} from '../src/chapterLocate';
const [irPath,mapPath,pdfPath,gen]=process.argv.slice(2);
if(!gen)throw Error('usage: Buffett WP4 <ir> <map> <pdf> <generation>');
const t0=performance.now();
const irRaw=readFileSync(irPath),mapRaw=readFileSync(mapPath),pdfRaw=readFileSync(pdfPath);
const sig=[sha256(irRaw),sha256(mapRaw),sha256(pdfRaw)];
const ir=JSON.parse(irRaw.toString()),map=JSON.parse(mapRaw.toString());
const originals=splitBook(ir,map,gen,sig[1]);
let cases=0;
function ok(v:unknown,why:string){assert.ok(v,why);cases++;}
function eq(a:unknown,b:unknown,why:string){assert.deepEqual(a,b,why);cases++;}
function reject(f:()=>unknown,why:string){assert.throws(f,/MOPJO/,why);cases++;}
const opened=originals.map(ch=>openChapter(ch,emptyChapterDelta(ch),pdfRaw));
// WP4.1 full OCR evidence: 224 logical + 91 unreferenced elements = 315.
const full=opened.flatMap(ch=>chapterSourceEvidence(ch));
const unique=new Set(full.map(x=>x.elementId));
eq(opened.length,6,'real chapters');
eq(full.length,ir.sourceElements.length,'every ORIGINAL source preserved');
eq(unique.size,315,'all 315 source elements once, no duplicate');
eq(full.filter(x=>x.role==='logical-source').length,224,'all logical sources');
eq(full.filter(x=>x.role==='page-proximity-unverified').length,91,'all discarded OCR evidence');
eq(opened.reduce((n,c)=>n+c.original.supplementalEvidence!.length,0),91,'explicit unverified attribution');
const one=opened[1];
const docText=(doc:OpenChapter,id:string)=>chapterElements(doc).find(x=>x.blockId===id)!;
const plain=(b:OpenChapter['blocks'][number])=>b.block.type==='text'&&b.mode==='text'&&
  b.content===b.block.text.replace(/\r\n?/g,'\n').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/^(?=[#>|])([#>|])/gm,'\\$1');
const sourceText=one.blocks.find(b=>plain(b)&&b.block.text.length>60)!;
ok(sourceText,'real source OCR paragraph');
const beforeSource=docText(one,sourceText.block.blockId);
const split=applyChapterOp(one,{kind:'split-text',blockId:sourceText.block.blockId,offset:30});
eq(split.blocks.length,one.blocks.length+1,'chapter text split');
const afterIndex=split.blocks.findIndex(x=>x.block.blockId===sourceText.block.blockId);
const second=split.blocks[afterIndex+1];
eq(split.blocks[afterIndex].block.text+second.block.text,sourceText.block.text,'split preserves all code units');
ok(second.block.blockId!==sourceText.block.blockId,'stable new part ID');
eq(docText(split,second.block.blockId).pdfRegions, beforeSource.pdfRegions,'split provenance bbox remains coarse');
const merged=applyChapterOp(split,{kind:'merge-text',blockId:sourceText.block.blockId,
  otherBlockId:second.block.blockId,separator:''});
eq(merged.blocks.length,one.blocks.length,'merged back to original block count');
eq(docText(merged,sourceText.block.blockId).text,sourceText.block.text,'merged text identical');
const doubleReplay=openChapter(merged.original,JSON.parse(Buffer.from(encodeChapterDelta(merged.delta)).toString()),pdfRaw);
eq(chapterMarkdown(doubleReplay),chapterMarkdown(merged),'two operations reloaded bit exact');
// Local text reorder cannot jump a heading or a chapter boundary.
const idx=one.blocks.findIndex((b,i)=>i+1<one.blocks.length&&plain(b)&&plain(one.blocks[i+1])&&
  b.block.chapterId===one.blocks[i+1].block.chapterId);
ok(idx>=0,'find adjacent real paragraphs within same section');
const left=one.blocks[idx],right=one.blocks[idx+1];
const reordered=applyChapterOp(one,{kind:'move-text',blockId:left.block.blockId,direction:'down'});
eq(reordered.blocks[idx].block.blockId,right.block.blockId,'reordered two adjacent paragraphs');
eq(reordered.blocks[idx+1].block.blockId,left.block.blockId,'reorder preserves stable IDs');
reject(()=>applyChapterOp(one,{kind:'move-text',blockId:one.blocks[0].block.blockId,direction:'up'}),
  'chapter root cannot be moved across boundary');
// WP4.2 heading rename through Markdown and outline projection.
const tree=effectiveChapterTree(one);
const leaf=one.blocks.find((b,i)=>i>0&&b.block.type==='title'&&
  one.original.chapterTree.some(x=>x.anchorBlockId===b.block.blockId&&x.parentChapterId!==null))!;
ok(Boolean(leaf),'real nested chapter heading');
const leafOffset=one.markdown.ranges.find(x=>x.blockId===leaf.block.blockId)!.contentFrom;
const originalHeading=leaf.content;
const replacement=originalHeading.replace(/[A-Za-z]/,m=>m.toUpperCase()===m?m.toLowerCase():m.toUpperCase());
const sourceMd=chapterMarkdown(one);
const headingDraft=sourceMd.replace(originalHeading,replacement);
if(replacement!==originalHeading){
  const renamed=editChapterMarkdown(one,headingDraft);
  const newTree=effectiveChapterTree(renamed);
  ok(newTree.some(x=>x.anchorBlockId===leaf.block.blockId&&x.name!==tree.find(t=>t.anchorBlockId===leaf.block.blockId)?.name),
    'title rename immediately reflected in derived outline');
  eq(chapterMarkdown(openChapter(renamed.original,renamed.delta,pdfRaw)),chapterMarkdown(renamed),'title edit replay');
}
// Heading hierarchy: an eligible leaf H2 can become a nested H3; chapter file cuts are fixed.
const hIndex=one.blocks.findIndex((b,i)=>i>0&&b.block.type==='title'&&b.content.startsWith('## ')&&
  one.original.chapterTree.some(x=>x.anchorBlockId===b.block.blockId&&
    x.parentChapterId!==null&&!one.original.chapterTree.some(c=>c.parentChapterId===x.chapterId))&&
  one.blocks.slice(0,i).some(x=>x.block.type==='title'&&x.content.startsWith('## ')));
ok(hIndex>=0,'real nested leaf heading can be reclassified without moving file boundary');
const h=one.blocks[hIndex];
const deeper=applyChapterOp(one,{kind:'heading-level',blockId:h.block.blockId,level:3});
ok(deeper.blocks[hIndex].content.startsWith('### '),'heading depth changed in MD projection');
const derived=effectiveChapterTree(deeper).find(x=>x.anchorBlockId===h.block.blockId)!;
eq(derived.depth,3,'derived outline depth matches emitted MD');
ok(effectiveChapterTree(deeper).some(x=>x.chapterId===derived.parentChapterId&&x.depth===2),
  'new H3 has a valid H2 parent');
eq(chapterMarkdown(openChapter(deeper.original,deeper.delta,pdfRaw)),chapterMarkdown(deeper),
  'heading hierarchy change replays without changing immutable chapter original');
reject(()=>applyChapterOp(one,{kind:'heading-level',blockId:one.blocks[0].block.blockId,level:3}),
  'chapter file root cannot be reclassified');
// Markdown projection for human-created heading / image / table / math is also derived from delta.
const chapterAnchor=one.blocks.find(b=>b.pdfPages.length&&b.block.type==='text')!;
const inserts=[
  {kind:'insert-manual-heading' as const,blockId:chapterAnchor.block.blockId,
    text:'Human reviewed section',page:chapterAnchor.pdfPages[0],level:2 as const},
  {kind:'insert-manual-rich' as const,blockId:chapterAnchor.block.blockId,
    page:chapterAnchor.pdfPages[0],mode:'equation' as const,content:'$$\nE=mc^2\n$$'},
  {kind:'insert-manual-rich' as const,blockId:chapterAnchor.block.blockId,
    page:chapterAnchor.pdfPages[0],mode:'table-html' as const,content:'<table><tr><td>A</td></tr></table>'},
  {kind:'insert-manual-rich' as const,blockId:chapterAnchor.block.blockId,
    page:chapterAnchor.pdfPages[0],mode:'image-link' as const,content:'[人工图片](https://example.org/verified.jpg)'},
];
let withInsert=one;
for(const req of inserts){
  withInsert=applyChapterOp(withInsert,req);
  eq(chapterMarkdown(openChapter(withInsert.original,withInsert.delta,pdfRaw)),chapterMarkdown(withInsert),
    'manual content/heading operation roundtrip '+req.kind);
}
const fromManual=chapterElements(withInsert).filter(x=>x.originalElementIds.length===0);
ok(fromManual.length>=4&&fromManual.every(x=>x.pdfRegions.length===0&&x.manualPage===chapterAnchor.pdfPages[0]),
  'manual heading/HTML/LaTeX/media get page-only, never fake original OCR rectangles');
ok(effectiveChapterTree(withInsert).some(x=>x.name==='Human reviewed section'),
  'manual heading included in effective outline, without rewriting original tree');
reject(()=>applyChapterOp(one,{kind:'insert-manual-rich',blockId:chapterAnchor.block.blockId,
  page:chapterAnchor.pdfPages[0],mode:'table-html',content:'<table><script>x</script></table>'}),
  'manual rich HTML refuses unsafe executable markup');
// Real inline equation belongs to a span inside an OCR body block, not a standalone equation block.
const sourceIndex=new Map(one.original.sourceElements.map(x=>[x.id,x]));
const inlineBlock=one.blocks.find(b=>b.mode==='text'&&b.block.type==='text'&&
  b.block.sources.some(ref=>sourceIndex.get(ref.elementId)?.segments.some(s=>
    s.type==='inline_equation'&&s.content&&b.content.includes(s.content)&&
    b.block.text.indexOf(s.content)===b.block.text.lastIndexOf(s.content))))!;
ok(Boolean(inlineBlock),'real Buffett body with unique inline formula');
const inlineSource=one.original.sourceElements.find(s=>inlineBlock.block.sources.some(r=>r.elementId===s.id)&&
  s.segments.some(seg=>seg.type==='inline_equation'&&seg.content&&
    inlineBlock.content.includes(seg.content)&&
    inlineBlock.block.text.indexOf(seg.content)===inlineBlock.block.text.lastIndexOf(seg.content)))!;
const inlineSegment=inlineSource.segments.find(seg=>seg.type==='inline_equation'&&seg.content&&
  inlineBlock.content.includes(seg.content)&&
  inlineBlock.block.text.indexOf(seg.content)===inlineBlock.block.text.lastIndexOf(seg.content))!;
const inlineBefore=inlineSegment.content!;
const inlineAfter=inlineBefore+'_{WP4}';
const inlineEdited=applyChapterOp(one,{kind:'replace-inline-formula',blockId:inlineBlock.block.blockId,
  elementId:inlineSource.id,segmentPointer:inlineSegment.jsonPointer,
  from:inlineBlock.content.indexOf(inlineBefore),before:inlineBefore,after:inlineAfter});
ok(inlineEdited.blocks.find(x=>x.block.blockId===inlineBlock.block.blockId)?.content.includes(inlineAfter),
  'inline formula correction changed only anchored text segment');
eq(chapterMarkdown(openChapter(inlineEdited.original,inlineEdited.delta,pdfRaw)),chapterMarkdown(inlineEdited),
  'inline formula edit replays exactly');
reject(()=>applyChapterOp(one,{kind:'replace-inline-formula',blockId:inlineBlock.block.blockId,
  elementId:inlineSource.id,segmentPointer:'not-a-source-pointer',
  from:inlineBlock.content.indexOf(inlineBefore),before:inlineBefore,after:'x'}),
  'fake formula provenance rejected');

// WP4.3 real selected media/table/equation source anchors.
let richCount=0;
for(const [mode,chapter] of [['image-link',opened[0]],['table-html',one],['equation',opened[3]]] as const){
  const b=chapter.blocks.find(b=>b.mode===mode&&b.block.sources.length>0&&
    (mode!=='table-html'||b.content.includes('<table')))!;
  ok(Boolean(b),'real source for '+mode);
  const id=b.block.sources.find(ref=>{
    const x=chapter.original.sourceElements.find(e=>e.id===ref.elementId);
    return x?.segments.some(s=>mode==='image-link'?s.imagePath:
      mode==='table-html'?s.html:s.type==='interline_equation');
  })!;
  const source=chapter.original.sourceElements.find(s=>s.id===id.elementId)!;
  const segment=source.segments.find(s=>mode==='image-link'?s.imagePath:
    mode==='table-html'?s.html:s.type==='interline_equation')!;
  let before='',after='';
  if(mode==='image-link'){
    before=segment.imagePath!;after='https://example.org/verified-image.jpg';
  }else if(mode==='table-html'){
    before='Stock/Fund Measure';after='Stock/Fund Metric';
    if(!b.content.includes(before)){before='Buffett';after='Buffetts';}
  }else{
    before='r _ {t + 1}';after='r _ {t + 2}';
  }
  const from=b.content.indexOf(before);
  ok(from>=0,'physical '+mode+' exact selected span');
  const updated=applyChapterOp(chapter,{kind:'replace-rich',blockId:b.block.blockId,
    elementId:source.id,segmentPointer:segment.jsonPointer,from,before,after});
  ok(updated.blocks.find(x=>x.block.blockId===b.block.blockId)!.content.includes(after),
    'safe '+mode+' content replacement committed in delta');
  eq(chapterMarkdown(openChapter(updated.original,updated.delta,pdfRaw)),chapterMarkdown(updated),
    'safe '+mode+' replay');
  eq(updated.blocks.find(x=>x.block.blockId===b.block.blockId)!.evidence,b.evidence,
    'rich '+mode+' source unchanged');
  reject(()=>applyChapterOp(chapter,{kind:'replace-rich',blockId:b.block.blockId,
    elementId:source.id,segmentPointer:segment.jsonPointer,from,before,after:'<script>bad</script>'}),
    'unsafe rich script rejected');
  richCount++;
}
// WP4.4 identify original physical note: the page-2 OCR classified this as footnote.
const withNote=opened.find(ch=>chapterAnnotationAudit(ch).length)!;
const notes=chapterAnnotationAudit(withNote);
eq(notes.length,1,'only physical page_footnote preserved');
eq(notes[0].pdfPage,2,'note original PDF page 2');
eq(notes[0].status,'needs-review','ambiguous physical OCR is not auto-paired');
const noteAnchor=withNote.blocks.find(b=>b.pdfPages.includes(2)&&b.block.type==='text')!;
ok(Boolean(noteAnchor),'same-page candidate for manual footnote audit');
const noted=applyChapterOp(withNote,{kind:'review-note',blockId:noteAnchor.block.blockId,
  noteElementId:notes[0].noteElementId,decision:'unmatched',noteNumber:null,
  detail:'WP4 read-only fixture: treat unnumbered original page footer as unmatched until human verification'});
eq(chapterAnnotationAudit(noted)[0].status,'reviewed','note review recorded in delta');
eq(chapterAnnotationAudit(noted)[0].reviews.length,1,'review persisted');
eq(chapterAnnotationAudit(openChapter(noted.original,noted.delta,pdfRaw))[0].reviews,
  chapterAnnotationAudit(noted)[0].reviews,'review replays exactly');
reject(()=>applyChapterOp(withNote,{kind:'review-note',blockId:noteAnchor.block.blockId,
  noteElementId:notes[0].noteElementId,decision:'confirmed',noteNumber:777,
  detail:'false number'}),'no false confirmed note without real reference');
// Additional artificial ambiguity fixture uses a clone of Buffett's real note and real text block.
// It is NEVER written to the original document and does not assert that Buffett has numbered notes.
const synthetic=structuredClone(withNote.original) as any; // synthetic-only mutable fixture
const firstNote=synthetic.supplementalEvidence!.find((x:any)=>x.source.type==='page_footnote')!;
const rawNote=firstNote.source.segments[0];
rawNote.content='1. Synthetic numbered note body';
const reference=synthetic.blocks.find((b:any)=>b.block.blockId===noteAnchor.block.blockId)!;
reference.block.text+=' <sup>1</sup>';
reference.content+=' &lt;sup&gt;1&lt;/sup&gt;';
const syntheticOpen=openChapter(synthetic,emptyChapterDelta(synthetic),pdfRaw);
eq(chapterAnnotationAudit(syntheticOpen)[0].detectedNumber,1,'synthetic note number recognized');
const syntheticConfirmed=applyChapterOp(syntheticOpen,{kind:'review-note',blockId:reference.block.blockId,
  noteElementId:firstNote.source.id,decision:'confirmed',noteNumber:1,
  detail:'Explicitly confirmed synthetic matching reference/body number'});
eq(chapterAnnotationAudit(syntheticConfirmed)[0].reviews[0].decision,'confirmed',
  'explicit numbered synthetic note pair reviewed');
eq(chapterMarkdown(openChapter(syntheticConfirmed.original,syntheticConfirmed.delta,pdfRaw)),
  chapterMarkdown(syntheticConfirmed),'confirmed annotation metadata delta roundtrip');
const duplicate=structuredClone(synthetic);
const clone=structuredClone(firstNote) as any;
clone.source.collectionPosition=999;
clone.source.id=clone.source.id.replace(/:discarded_blocks:\d+$/u,':discarded_blocks:999');
clone.source.jsonPointer=clone.source.jsonPointer.replace(/discarded_blocks\/\d+$/u,'discarded_blocks/999');
duplicate.supplementalEvidence.push(clone);
const duplicateOpen=openChapter(duplicate,emptyChapterDelta(duplicate),pdfRaw);
eq(chapterAnnotationAudit(duplicateOpen).filter(x=>x.status==='ambiguous').length,2,
  'same-page repeated annotation number always signals ambiguity');

// WP4.5 segment-level identity: inline equation includes original physical span and a resolvable MD offset.
const indexed=chapterSegmentIndex(one);
const inlinePhysical=indexed.find(x=>x.kind==='inline_equation'&&x.markdownRange&&
  x.blockId===inlineBlock.block.blockId)!;
ok(Boolean(inlinePhysical),'inline formula has stable original JSON segmentPointer and MD position');
const segmentHit=chapterMarkdownOffset(one,inlinePhysical.markdownRange!.from+1);
eq(segmentHit.hit?.segmentPointer,inlinePhysical.segmentPointer,
  'MD cursor hits original inline-formula segment, not only parent paragraph');
const precisePdf=chapterPdfPoint(one,inlinePhysical.page,
  (inlinePhysical.normalizedBBox[0]+inlinePhysical.normalizedBBox[2])/2,
  (inlinePhysical.normalizedBBox[1]+inlinePhysical.normalizedBBox[3])/2);
ok(precisePdf.matches.some(x=>x.segmentPointer===inlinePhysical.segmentPointer),
  'PDF physical OCR segment can be found via source pointer');
const locatorMultis=chapterSegmentIndex(one).filter(x=>x.resolution==='ambiguous-text');
ok(locatorMultis.every(x=>x.markdownRange===null),
  'repeated content never receives a guessed MD offset');

// WP4.5 PDF point -> original OCR or discarded evidence; MD offset -> anchored block.
const r=beforeSource.pdfRegions[0];
const bbox=r.normalizedBBox;
const p=chapterPdfPoint(one,r.page,(bbox[0]+bbox[2])/2,(bbox[1]+bbox[3])/2);
ok(p.matches.some(x=>x.blockId===sourceText.block.blockId),'PDF physical OCR hit includes selected block');
const mdRange=beforeSource.markdownRange!;
const back=chapterMarkdownOffset(one,mdRange.from+1);
eq(back.hit?.blockId,sourceText.block.blockId,'MD offset maps back to stable ID');
eq(back.hit?.page,r.page,'MD hit maps to original PDF page');
const noteBox=notes[0].bbox;
const evidencePoint=chapterPdfPoint(withNote,2,(noteBox[0]+noteBox[2])/2/withNote.original.supplementalEvidence!.find(x=>x.source.id===notes[0].noteElementId)!.source.pageSize[0],
  (noteBox[1]+noteBox[3])/2/withNote.original.supplementalEvidence!.find(x=>x.source.id===notes[0].noteElementId)!.source.pageSize[1]);
ok(evidencePoint.matches.some(x=>x.elementId===notes[0].noteElementId&&x.evidenceKind==='discarded-unverified'),
  'PDF physically hits source-only discarded annotation');
const manual=applyChapterOp(one,{kind:'insert-manual-text',blockId:sourceText.block.blockId,
  text:'manual first\nmanual second',page:beforeSource.pdfPages[0]});
const manualBlock=manual.blocks.find(x=>x.block.text==='manual first\nmanual second')!;
const joined=applyChapterOp(manual,{kind:'join-soft-break',blockId:manualBlock.block.blockId,
  offset:'manual first'.length});
eq(joined.blocks.find(x=>x.block.blockId===manualBlock.block.blockId)?.block.text,
  'manual firstmanual second','soft-break join explicit');
const view=chapterElements(joined).find(x=>x.blockId===manualBlock.block.blockId)!;
eq(view.pdfRegions.length,0,'manual content has no made-up OCR rectangle');
eq(view.manualPage,beforeSource.pdfPages[0],'manual content has only explicit PDF page');
// Immutable sources and cache independence.
for(let i=0;i<opened.length;i++){
  eq(chapterMarkdown(openChapter(originals[i],emptyChapterDelta(originals[i]),pdfRaw)),
     chapterMarkdown(opened[i]),'unchanged chapter independently reopenable');
}
eq([sha256(readFileSync(irPath)),sha256(readFileSync(mapPath)),sha256(readFileSync(pdfPath))],sig,
  'actual Buffett original documents never written');
const elapsedMs=Math.round(performance.now()-t0);
console.log('MOPJO_WP4_BUFFETT_PASS',JSON.stringify({cases,realSourceElements:full.length,
 discarded:full.filter(x=>x.role==='page-proximity-unverified').length,
 originalBlocks:224,chapters:6,richEdited:richCount,notes:notes.length,elapsedMs,
 immutableSources:true,replayDeterministic:true}));
