/** WP0 read-only evidence audit for an explicitly supplied single Markdown
 * path and legacy chapter folder. Does not create, move or edit user files.
 * Usage: node --experimental-loader ./labs/cm-html/wp0-2/css-loader.mjs
 *   labs/cm-html/wp0-2/audit.mjs <mother.md> <chapter-folder>
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildDocumentIndex} from './document-index.js';
import {buildOutline} from '../../../ui/outline-index.js';
import {decodeMarker} from '../../../ui/chapter-markers.js';
import {chapterAssignments,buildChapterFiles} from '../../../ui/chapter-files.js';
import {findLatex} from '../../../ui/latex-scan.js';
import {findMedia} from '../../../ui/media-module.js';
import {scanAnnotations} from '../../../ui/cmd-annotations.js';

const [path,folder]=process.argv.slice(2);
if(!path||!folder)throw Error('Provide a read-only source Markdown and chapter directory');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const mother=readFileSync(path),source=mother.toString('utf8');
assert.equal(Buffer.compare(Buffer.from(source),mother),0,'Invalid source UTF-8');
const manifest=JSON.parse(readFileSync(join(folder,'manifest.json'),'utf8'));
assert.equal(manifest.sourceSha256,hash(mother),'Legacy manifest references a different mother snapshot');
const index=buildDocumentIndex(source);
assert.equal(index.chapters.length,manifest.files.length,'Chapter partition count mismatch');
const headings=buildOutline(source),lines=source.split('\n');
for(const row of headings){const marker=decodeMarker(lines[row.sourceLine-2]||'');
  row.independent=marker?.id===row.id?marker.independent:true;
}
const projected=buildChapterFiles(source,headings,'000');
assert.equal(index.chapters.map(c=>index.chapterText(c.id)).join(''),source.slice(0,index.bodyEnd));
const reports=manifest.files.map((entry,i)=>{
  const data=readFileSync(join(folder,entry.name));
  assert.equal(hash(data),entry.sha256,`Corrupted physical chapter ${entry.name}`);
  const text=data.toString('utf8');
  const model=projected[i];
  const chapter=index.chapters[i];
  assert.equal(chapter.firstHeadingId,model.firstId,'Logical/legacy chapter boundary mismatch');
  const latex=findLatex(text);
  const annotations=scanAnnotations(text);
  const counts={heading:buildOutline(text).length,media:findMedia(text).length,latex:latex.length};
  const virtualCounts=Object.fromEntries(['heading','media','latex']
    .map(type=>[type,index.queryElements({type,chapter:chapter.id}).length]));
  return {
    ordinal:i,logicalId:chapter.id,name:entry.name,
    legacyBytes:data.length,legacySha256:hash(data),
    equalsRebuiltLegacyExport:text===model.content,
    rebuiltExportBytes:Buffer.byteLength(model.content),
    legacyLatexReviewMarkers:annotations.filter(item=>item.tag==='ocr2md:latex').length,
    legacyChapterMarkers:annotations.filter(item=>item.tag==='ocr2md:chapter:v1').length,
    actualElements:counts,virtualElements:virtualCounts,
    elementCountsEqual:Object.keys(counts).every(k=>counts[k]===virtualCounts[k]),
  };
});
const motherAnnotations=scanAnnotations(source);
const result={
  source:{bytes:mother.length,sha256:hash(mother),chars:source.length,
    bodyChars:index.bodyEnd,evidenceChars:source.length-index.bodyEnd},
  manifest:{files:manifest.files.length,sourceSha256:manifest.sourceSha256},
  virtual:{chapters:index.chapters.length,chapterIds:index.chapters.map(c=>c.id),
    elements:Object.fromEntries(['heading','media','latex'].map(type=>[type,index.queryElements({type}).length])),
    notes:{'chapterMarker':motherAnnotations.filter(a=>a.tag==='ocr2md:chapter:v1').length,
      'latexReviewMarker':motherAnnotations.filter(a=>a.tag==='ocr2md:latex').length},
    warnings:index.warnings},
  physical:reports,
  totalLegacyReviewMarkers:reports.reduce((sum,r)=>sum+r.legacyLatexReviewMarkers,0),
  allManifestChecksumsMatch:true,allVirtualSpansConcatenate:true,
  allElementCountsMatch:reports.every(r=>r.elementCountsEqual),
};
console.log(JSON.stringify(result,null,2));
