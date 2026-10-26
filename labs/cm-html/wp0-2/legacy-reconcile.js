/** WP7 lossless reconciliation from manifest-backed legacy chapters.
 * Replaying the existing review planner must regenerate each legacy file
 * byte-for-byte. Any other drift blocks migration; no IO in this module.
 */
import {createHash} from 'node:crypto';
import {buildOutline} from '../../../ui/outline-index.js';
import {decodeMarker} from '../../../ui/chapter-markers.js';
import {buildChapterFiles} from '../../../ui/chapter-files.js';
import {buildDocumentIndex} from './document-index.js';
import {findLatex} from '../../../ui/latex-scan.js';
import {findReviewMarkers,planReviewAnnotations} from '../../../ui/latex-review-markers.js';
import {scanAnnotations,formatAnnotation} from '../../../ui/cmd-annotations.js';

const hash=data=>createHash('sha256').update(data).digest('hex');
const assert=(yes,message)=>{if(!yes)throw Error('WP7 reconciliation conflict: '+message);};
const sourceRows=source=>{
  const rows=buildOutline(source),lines=source.split('\n');
  for(const row of rows){
    const annotation=decodeMarker(lines[row.sourceLine-2]||'');
    row.independent=annotation?.id===row.id?annotation.independent:true;
  }
  return rows;
};
function operationsToEdits(source,operations){
  const edits=operations.map(op=>{
    if(op.action==='text')
      return {from:op.from,to:op.to,expected:op.expected,insert:op.insert};
    assert(op.action==='insert','unexpected non-insert annotation operation');
    return {from:op.at,to:op.at,expected:'',
      insert:(op.prefix||'')+formatAnnotation(op.tag,op.attributes,{spaced:op.spaced})+(op.suffix||'')};
  });
  edits.sort((a,b)=>a.from-b.from);
  let previousEnd=0;
  for(const edit of edits){
    assert(Number.isInteger(edit.from)&&Number.isInteger(edit.to)&&
      edit.from>=previousEnd&&edit.to>=edit.from&&edit.to<=source.length,
    'overlapping or invalid CMD edit range');
    assert(source.slice(edit.from,edit.to)===edit.expected,
      'stale expected CMD source span');
    previousEnd=edit.to;
  }
  return edits;
}
export function applyVerifiedOperations(source,operations){
  const edits=operationsToEdits(source,operations);
  for(let i=edits.length-1;i>=0;i--){
    const {from,to,insert}=edits[i];
    source=source.slice(0,from)+insert+source.slice(to);
  }
  return source;
}
const formulasOf=source=>findLatex(source).map(row=>({...row,raw:source.slice(row.from,row.to)}));
const exportName=name=>name.replace(/\.md$/,'.cmd.chapter.md');

export function reconcilePhysicalChapters(mother,manifest,physical){
  assert(typeof mother==='string'&&mother.length>0,'missing source');
  assert(manifest&&Array.isArray(manifest.files)&&Array.isArray(physical),
    'missing old chapter manifest or files');
  assert(manifest.sourceSha256===hash(mother),
    'mother SHA-256 differs from legacy export snapshot');
  const start=/^([0-9]{1,5})-/.exec(manifest.files[0]?.name||'')?.[1];
  assert(Boolean(start),'legacy start chapter number missing');
  const originalIndex=buildDocumentIndex(mother,{startNumber:start});
  assert(!originalIndex.warnings.length,'mother index has boundary or element warnings');
  const exports=buildChapterFiles(mother,sourceRows(mother),start);
  assert(exports.length===manifest.files.length&&physical.length===exports.length,
    'chapter count differs from manifest');
  assert(!scanAnnotations(mother).some(a=>a.tag==='ocr2md:latex'),
    'mother already has LaTeX review markers; manual conflict check needed');

  const allMotherFormulas=formulasOf(mother);
  const byChapter=new Map(originalIndex.chapters.map(c=>[c.id,[]]));
  for(const formula of allMotherFormulas){
    const owner=originalIndex.chapterAt(formula.from);
    assert(owner&&byChapter.has(owner.id),'unassigned mother formula');
    byChapter.get(owner.id).push(formula);
  }
  const seenReviews=new Set(),allOperations=[],chapterChecks=[];
  let expectedReviewCount=0;
  for(const [i,item]of exports.entries()){
    const entry=manifest.files[i],old=physical[i];
    assert(entry?.name===exportName(item.name),'manifest chapter name or ordering changed');
    assert(typeof old==='string'&&Buffer.byteLength(old)===entry.bytes&&hash(old)===entry.sha256,
      'legacy chapter checksum invalid: '+entry.name);
    assert(item.firstId===originalIndex.chapters[i].id,
      'chapter identity no longer matches CMD projection');
    const baseline=formulasOf(item.content);
    const historical=findReviewMarkers(old,formulasOf(old),scanAnnotations(old));
    const live=byChapter.get(item.firstId);
    assert(baseline.length===historical.length&&live.length===baseline.length,
      'LaTeX formula count drift in '+entry.name);
    const oldAnnotations=scanAnnotations(old).filter(a=>a.tag==='ocr2md:latex');
    expectedReviewCount+=oldAnnotations.length;
    const replay=[],sourceOps=[];
    let reviewed=0;
    for(let j=0;j<baseline.length;j++){
      const a=baseline[j],b=historical[j],c=live[j];
      assert(a.content===b.content&&a.content===c.content&&a.kind===b.kind&&a.kind===c.kind,
        'formula changed outside recognized review ('+i+':'+j+')');
      assert(a.syntax===c.syntax,'mother formula syntax mismatch');
      if(!b.reviewMarker)continue;
      const mark=b.reviewMarker;
      assert(!mark.closing&&b.status==='latex'&&
        /^[a-f0-9]{16}$/.test(mark.id)&&!seenReviews.has(mark.id),
        'ambiguous, duplicate or unsupported review ID');
      seenReviews.add(mark.id);
      reviewed++;
      replay.push(...planReviewAnnotations(item.content,a,b.status,mark.id));
      sourceOps.push(...planReviewAnnotations(mother,c,b.status,mark.id));
    }
    assert(oldAnnotations.length===reviewed,'unmatched annotations in '+entry.name);
    const reconstructed=applyVerifiedOperations(item.content,replay);
    assert(reconstructed===old,'non-review body edits or annotation attributes in '+entry.name);
    allOperations.push(...sourceOps);
    chapterChecks.push({chapterId:item.firstId,name:entry.name,reviewed,
      legacySha256:entry.sha256,perfectReplay:true});
  }
  assert(seenReviews.size===expectedReviewCount,
    'not all manifest-backed reviews were recovered');
  const merged=applyVerifiedOperations(mother,allOperations);
  const afterIndex=buildDocumentIndex(merged,{startNumber:start});
  assert(afterIndex.chapters.length===originalIndex.chapters.length&&
    afterIndex.chapters.every((c,i)=>c.id===originalIndex.chapters[i].id),
    'logical chapter boundaries changed');
  assert(merged.slice(afterIndex.bodyEnd)===mother.slice(originalIndex.bodyEnd),
    'MinerU evidence tail changed');
  assert(afterIndex.queryElements({type:'latex'}).length===allMotherFormulas.length,
    'LaTeX count changed');
  assert(afterIndex.queryElements({type:'media'}).length===originalIndex.queryElements({type:'media'}).length,
    'Media links changed unexpectedly');
  const post=buildChapterFiles(merged,sourceRows(merged),start);
  for(let i=0;i<post.length;i++){
    assert(post[i].content===physical[i],
      'reverse export does not match legacy chapter '+manifest.files[i].name);
  }
  const recovered=findReviewMarkers(merged,formulasOf(merged),scanAnnotations(merged))
    .filter(row=>row.reviewMarker);
  assert(recovered.length===seenReviews.size&&
    recovered.every(row=>seenReviews.has(row.reviewMarker.id)),
    'recovered review IDs not preserved');
  return Object.freeze({
    merged,
    report:Object.freeze({
      motherSha256:hash(mother),candidateSha256:hash(merged),
      bodyBytesBefore:Buffer.byteLength(mother.slice(0,originalIndex.bodyEnd)),
      bodyBytesAfter:Buffer.byteLength(merged.slice(0,afterIndex.bodyEnd)),
      originalEvidenceSha256:hash(mother.slice(originalIndex.bodyEnd)),
      recoveredReviewIds:recovered.map(row=>row.reviewMarker.id).sort(),
      counts:{chapters:afterIndex.chapters.length,
        heading:afterIndex.queryElements({type:'heading'}).length,
        media:afterIndex.queryElements({type:'media'}).length,
        latex:afterIndex.queryElements({type:'latex'}).length,
        reviewed:recovered.length},
      legacyChapters:chapterChecks,
      legacyByteForByteReproduced:true,
    }),
  });
}
