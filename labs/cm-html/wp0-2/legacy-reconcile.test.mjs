import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {reconcilePhysicalChapters} from './legacy-reconcile.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const dir=process.env.WP7_FIXTURE_DIR;
if(!dir)throw Error('WP7_FIXTURE_DIR must point to an isolated copied fixture');
const mother=readFileSync(join(dir,'document.md'),'utf8');
const manifest=JSON.parse(readFileSync(join(dir,'chapter','manifest.json'),'utf8'));
const physical=manifest.files.map(f=>readFileSync(join(dir,'chapter',f.name),'utf8'));
const original=hash(mother),chapterHashes=physical.map(hash);
const {merged,report}=reconcilePhysicalChapters(mother,manifest,physical);
assert.deepEqual(report.counts,{chapters:6,heading:19,media:11,latex:42,reviewed:38});
assert.deepEqual(report.legacyChapters.map(c=>c.reviewed),[0,24,0,8,6,0]);
assert(report.legacyByteForByteReproduced);
assert.notEqual(merged,mother);
assert.equal(report.recoveredReviewIds.length,38);
assert.deepEqual([...new Set(report.recoveredReviewIds)].sort(),report.recoveredReviewIds);
assert.equal(hash(mother),original);
assert.deepEqual(physical.map(hash),chapterHashes);
const mustConflict=(label,fn)=>{
 assert.throws(fn,/WP7 reconciliation conflict:/,label);
};
mustConflict('stale mother / lost edit',()=>reconcilePhysicalChapters(mother+'EXTERNAL EDIT',manifest,physical));
mustConflict('unmanaged body change',()=>{
 const changed=[...physical];changed[1]=changed[1].replace('To evaluate','To review');
 const altered=structuredClone(manifest);
 altered.files[1].sha256=hash(changed[1]);altered.files[1].bytes=Buffer.byteLength(changed[1]);
 return reconcilePhysicalChapters(mother,altered,changed);
});
mustConflict('modified review marker attribute',()=>{
 const changed=[...physical];changed[3]=changed[3].replace('review="latex"','review="忽略"');
 const altered=structuredClone(manifest);
 altered.files[3].sha256=hash(changed[3]);altered.files[3].bytes=Buffer.byteLength(changed[3]);
 return reconcilePhysicalChapters(mother,altered,changed);
});
mustConflict('tampered actual chapter',()=>{
 const changed=[...physical];changed[4]+='\n';return reconcilePhysicalChapters(mother,manifest,changed);
});
mustConflict('duplicate ID',()=>{
 const changed=[...physical],altered=structuredClone(manifest);
 changed[3]=changed[3].replace(/id="[a-f0-9]{16}"/,'id="1e2eee9702144410"');
 altered.files[3].sha256=hash(changed[3]);altered.files[3].bytes=Buffer.byteLength(changed[3]);
 return reconcilePhysicalChapters(mother,altered,changed);
});
console.log('WP7_LOSSLESS_RECONCILIATION_PASS',JSON.stringify({
  before:original,after:report.candidateSha256,chapters:report.counts.chapters,
  reviewed:report.counts.reviewed,byChapter:report.legacyChapters.map(c=>c.reviewed),
  oldChaptersRegenerated:true,sourceArchivePreserved:true,conflictGates:5,
}));
