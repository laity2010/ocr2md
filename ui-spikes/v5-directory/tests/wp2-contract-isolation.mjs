/** WCP cannot load the old mixed V4 File/DIRjson service before workspace exists.
 * Keep original bytes as historical evidence, verify no live registry import.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const descriptor=JSON.parse(await readFile(new URL('../plugins/filesystem/plugin.json',import.meta.url)));
const registry=await readFile(new URL('../plugins/registry.generated.js',import.meta.url),'utf8');
assert.equal(descriptor.enabled,false);
assert(!registry.includes('filesystem/index.js'));
assert(!registry.includes('ocr2md:filesystem'));
const original=await readFile(new URL('../plugins/filesystem/workspace-fs.js',import.meta.url),'utf8');
assert(original.includes('boundary.ir.load')&&original.includes('clean.chapter.begin'),
  'source remains untouched so AEL can independently audit historical debt');
assert(!registry.includes('boundary.ir.load')&&!registry.includes('clean.chapter.begin'));
console.log('V5_LEGACY_MIXED_FILESYSTEM_NOT_REGISTERED_PASS',JSON.stringify({
 active:false,legacyEvidencePreserved:true,businessHandlersPublished:false}));
