/** IR-WP2 real-book NONDESTRUCTIVE importer acceptance: original PDF + MinerU JSON only.
 * The generated IR preview is written solely to project-local .tmp/ir-wp2/;
 * no Obsidian vault writes, no official Markdown parsing/dependency.
 * Requires npm --prefix ui-spikes/v3-directory run test:ir first.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root=process.argv[2]||'/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha';
const project=path.resolve(__dirname,'../../..');
const baseline=JSON.parse(fs.readFileSync(path.resolve(__dirname,'fixtures/buffett-alpha-wp0.json'),'utf8'));
const {importMineruDocumentIrFromBytes,reconstructMineruJsonFromIr}=require(path.join(project,'.tmp/ir-wp2/compiled/documentIrImport.js'));
const {encodeDocumentIrV1,validateDocumentIrV1}=require(path.join(project,'.tmp/ir-wp2/compiled/documentIrV1.js'));
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const logical='/ocr2md/Bufett’s Alpha';
const pdf=path.join(root,baseline.inputs.pdf.relativePath);
const ocr=path.join(root,baseline.inputs.json.relativePath);
const officialMd=path.join(root,baseline.inputs.md.relativePath);
const sidecar=path.join(root,'.ocr2md/pdf-md-map.v1.json');
const sample=[pdf,ocr,officialMd,sidecar];
const snapshot=paths=>Object.fromEntries(paths.map(p=>{
 const stat=fs.statSync(p);return [p,{size:stat.size,mtime:stat.mtimeMs,sha256:digest(fs.readFileSync(p))}];
}));
const before=snapshot(sample);
try{
  assert.equal(before[pdf].sha256,baseline.inputs.pdf.sha256);
  assert.equal(before[ocr].sha256,baseline.inputs.json.sha256);
  assert.equal(before[officialMd].sha256,baseline.inputs.md.sha256);
  assert.equal(before[sidecar].sha256,'168d6bb0a5a957dc2bb797be481f47edf7a9746bf12e01eea4e4bf7cac5ee1e2');
  const originalJson=fs.readFileSync(ocr),pdfBytes=fs.readFileSync(pdf);
  const ir=importMineruDocumentIrFromBytes('obsidian-ocr2md',logical+'/'+baseline.inputs.pdf.relativePath,
    pdfBytes,logical+'/'+baseline.inputs.json.relativePath,originalJson);
  validateDocumentIrV1(ir);
  assert.equal(ir.pages.length,baseline.pages);
  assert.equal(ir.blocks.length,baseline.paragraphBlocks);
  assert.equal(ir.sourceElements.length,baseline.paragraphBlocks+baseline.discardedBlocks);
  assert.equal(ir.summary.bodyElements,baseline.paragraphBlocks);
  assert.equal(ir.summary.discardedElements,baseline.discardedBlocks);
  assert.equal(ir.blocks.length,ir.summary.provisionalBlocks);
  assert.equal(ir.chapters.length,0);
  assert.equal(ir.outputMarkdown.length,0);
  assert.ok(ir.blocks.every(b=>b.audit==='unreviewed'&&b.chapterId===null&&b.readingOrder===null));
  const input=JSON.parse(originalJson.toString('utf8'));
  assert.deepStrictEqual(reconstructMineruJsonFromIr(ir),input,
    'Lossless structured roundtrip of raw MinerU JSON must preserve top/page metadata and preproc');
  assert.equal(ir.pages[7].pageSize[0],783);
  assert.equal(ir.pages[10].pageSize[0],783);
  assert.deepEqual(ir.pages.map(p=>p.pageIndex),Array.from({length:22},(_,i)=>i));
  for(const source of ir.sourceElements){
    assert.equal(source.id.includes(source.collection),true);
    const page=ir.pages[source.pageIndex];
    assert.equal(page.pdfPageNumber,source.pdfPageNumber);
    assert.equal(source.normalizedBBox.length,4);
    assert.ok(source.normalizedBBox.every(x=>x>=0&&x<=1));
  }
  const ids=new Set(ir.sourceElements.map(s=>s.id));
  for(const b of ir.blocks)assert.ok(b.sources.every(s=>ids.has(s.elementId)), 'all logic blocks must trace to real PDF');
  const types=(collection)=>Object.fromEntries(Object.entries(ir.sourceElements.filter(e=>e.collection===collection)
    .reduce((c,e)=>(c[e.type]=(c[e.type]??0)+1,c),{})).sort());
  assert.deepStrictEqual(types('para_blocks'),Object.fromEntries(Object.entries(baseline.bodyTypes).sort()));
  assert.deepStrictEqual(types('discarded_blocks'),Object.fromEntries(Object.entries(baseline.discardedTypes).sort()));
  const json=encodeDocumentIrV1(ir);
  const outDir=path.join(project,'.tmp/ir-wp2');fs.mkdirSync(outDir,{recursive:true});
  const out=path.join(outDir,'document-ir.v1.json');
  let output='existing-matched';
  if(fs.existsSync(out)){
    assert.deepEqual(fs.readFileSync(out),Buffer.from(json),'refuse to replace a different IR preview');
  }else{
    const fd=fs.openSync(out,'wx',0o600);
    try{fs.writeFileSync(fd,json);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    output='created';
  }
  const persisted=JSON.parse(fs.readFileSync(out,'utf8'));
  validateDocumentIrV1(persisted);
  assert.deepStrictEqual(reconstructMineruJsonFromIr(persisted),input,'persisted IR roundtrip differs');
  const after=snapshot(sample);assert.deepStrictEqual(after,before,'forbidden source files modified');
  assert.equal(fs.existsSync(path.join(root,'.ocr2md/document-ir.v1.json')),false,
    'no real-vault sidecar may be written during WP2');
  console.log('IR_WP2_REAL_SOURCE_IMPORT_PASS '+JSON.stringify({
    workspaceId:ir.workspaceId,ocrSha256:ir.ocr.sha256,pdfSha256:ir.pdf.sha256,
    pages:ir.pages.length,sourceElements:ir.sourceElements.length,body:ir.summary.bodyElements,
    discarded:ir.summary.discardedElements,preprocEvidence:ir.pages.reduce((s,p)=>s+p.preprocBlocks.length,0),
    provisionalBlocks:ir.blocks.length,chapters:0,generatedMarkdown:0,
    semanticRoundtrip:true,sourceUnchanged:true,noOfficialMdDependency:true,
    irBytes:json.byteLength,irSha256:digest(json),preview:out,previewAction:output
  }));
}catch(error){console.error('IR_WP2_REAL_SOURCE_IMPORT_FAIL',error);process.exitCode=1;}
