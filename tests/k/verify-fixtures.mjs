/** Read-only K WP0 fixture preflight. No user data writes, no production-code oracle. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const manifest=JSON.parse(readFileSync(resolve(repo,'tests/k/data.json'),'utf8'));
function source(label,item){
  const file=resolve(repo,item.path);
  const bytes=readFileSync(file);
  const actual=createHash('sha256').update(bytes).digest('hex');
  assert.equal(actual,item.sha256,`${label} SHA-256 changed: ${item.path}`);
  return bytes;
}
const json=JSON.parse(source('raw MinerU JSON',manifest.inputs.mineruJson));
assert.equal(json.pdf_info.length,manifest.inputs.mineruJson.pdfPages);
const md=source('Markdown source fixture',manifest.inputs.sourceMarkdownFixture).toString('utf8');
const counts={
  blocks:(md.match(/<!-- minerujson:block:v1:/g)||[]).length,
  endMarkers:(md.match(/<!-- minerujson:end:v1:/g)||[]).length,
  chapterAnnotations:(md.match(/ocr2md:chapter:v1/g)||[]).length,
};
for(const [key,count] of Object.entries(counts))
  assert.equal(count,manifest.inputs.sourceMarkdownFixture[key],`${key} count differs`);
source('read-only PDF',manifest.inputs.pdf);
console.log('K_FIXTURE_PRECHECK_PASS',JSON.stringify({rawPdfPages:json.pdf_info.length,...counts,
  pdf:'SHA-verified',status:manifest.status}));
console.log('K_CERTIFICATION_NOT_YET_PERFORMED');
