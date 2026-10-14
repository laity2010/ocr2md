/** WP6 real book: only WP4 IR, source PDFs/JSON never modified. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'../../..');
const input=path.join(project,'.tmp/ir-wp4/document-ir.v1.json');
const {validateDocumentIrV1}=require(path.join(project,'.tmp/ir-wp6/compiled/documentIrV1.js'));
const {generateIrMarkdownBundle,validateIrMarkdownBundle,irMarkdownSourceAtOffset}=
  require(path.join(project,'.tmp/ir-wp6/compiled/documentIrMarkdown.js'));
const dir=path.join(project,'.tmp/ir-wp6/preview');
const originalRoot='/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha';
const files=['Buffett s Alpha.pdf','json/MinerU_Buffett s Alpha__20261008112941.json','.ocr2md/pdf-md-map.v1.json'];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const before=files.map(x=>({path:x,mtime:fs.statSync(path.join(originalRoot,x)).mtimeMs,sha:sha(fs.readFileSync(path.join(originalRoot,x)))}));
const original=fs.readFileSync(input);
assert.equal(sha(original),'f9b25a3d24a88638ab73ece17b04bc2b48d957bdb2a6450849d9d31901188633');
const doc=JSON.parse(original);validateDocumentIrV1(doc);
const bundle=generateIrMarkdownBundle(doc);validateIrMarkdownBundle(doc,bundle);
assert.equal(bundle.files.length,6);
assert.equal(bundle.files.flatMap(f=>f.ranges).length,224);
const byMode={};for(const f of bundle.files)for(const range of f.ranges)byMode[range.mode]=(byMode[range.mode]||0)+1;
assert.deepEqual(byMode,{heading:21,text:143,'image-link':7,'table-html':9,'chart-link':4,equation:20,reference:20});
const pageSet=new Set(bundle.files.flatMap(f=>f.ranges.flatMap(r=>r.pdfPages)));
assert.deepEqual([...pageSet].sort((a,b)=>a-b),Array.from({length:22},(_,i)=>i+1));
for(const f of bundle.files){
 for(const r of f.ranges){
  assert.equal(irMarkdownSourceAtOffset(f,r.contentFrom).blockId,r.blockId);
  assert.equal(f.content.slice(r.from,r.to).includes(r.blockId),true);
  assert.equal(f.content.slice(r.contentFrom,r.contentTo).length>0,true);
 }
}
assert.ok(bundle.files.some(f=>f.content.includes('```html')));
assert.ok(bundle.files.some(f=>f.content.includes('```math')));
assert.ok(bundle.warnings.length>=20);
assert.ok(!bundle.files.some(f=>f.content.includes('![](https://cdn-mineru')),'external images must not autoload');
fs.mkdirSync(dir,{recursive:true});
function persist(filename,bytes){const dest=path.join(dir,filename);if(fs.existsSync(dest)){
 assert.deepEqual(fs.readFileSync(dest),Buffer.from(bytes),'preview output changed unexpectedly');return;
}const fd=fs.openSync(dest,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
const names=[];
for(const f of bundle.files){const name=path.basename(f.path);persist(name,new TextEncoder().encode(f.content));names.push(name);}
const manifest={...bundle,files:bundle.files.map(({content,...fields})=>fields)};
const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
persist('document-ir.markdown-manifest.v1.json',manifestBytes);
const after=files.map(x=>({path:x,mtime:fs.statSync(path.join(originalRoot,x)).mtimeMs,sha:sha(fs.readFileSync(path.join(originalRoot,x)))}));
assert.deepEqual(after,before);
assert.equal(fs.existsSync(path.join(originalRoot,'.ocr2md/document-ir.v1.json')),false);
console.log('IR_WP6_REAL_MARKDOWN_PASS',JSON.stringify({rootFiles:bundle.files.length,blocks:224,pages:pageSet.size,
  types:byMode,warnings:bundle.warnings.length,chapterFiles:names,manifestSha256:sha(manifestBytes),
  stable:true,sourceUnmodified:true,officialMdNotRead:true,preview:dir}));
