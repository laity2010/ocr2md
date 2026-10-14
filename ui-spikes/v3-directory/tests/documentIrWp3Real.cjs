/** IR-WP3 real book: source-conserving structured *candidate* reconstruction.
 * No official MD. Zero vault writes. Preview must be create-once/idempotent.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'../../..'),root='/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha';
const compiled=path.join(project,'.tmp/ir-wp3/compiled');
const {encodeDocumentIrV1,validateDocumentIrV1}=require(path.join(compiled,'documentIrV1.js'));
const {proposeIrReconstruction,explicitMergeAdjacentTextBlocks,explicitSplitBlockAtUtf16}=require(path.join(compiled,'documentIrReconstruction.js'));
const {reconstructMineruJsonFromIr}=require(path.join(compiled,'documentIrImport.js'));
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const pdf=path.join(root,'Buffett s Alpha.pdf'),ocr=path.join(root,'json/MinerU_Buffett s Alpha__20261008112941.json'),
  originalMd=path.join(root,'md/MinerU_markdown_Buffett_s_Alpha_2108158143412957184.md'),
  legacyMap=path.join(root,'.ocr2md/pdf-md-map.v1.json');
const originals=[pdf,ocr,originalMd,legacyMap],manifest=files=>files.map(p=>({p,mtime:fs.statSync(p).mtimeMs,hash:digest(fs.readFileSync(p))}));
const before=manifest(originals);
try{
  const baseline=JSON.parse(fs.readFileSync(path.join(project,'ui-spikes/v3-directory/tests/fixtures/buffett-alpha-wp0.json'),'utf8'));
  assert.equal(before[0].hash,baseline.inputs.pdf.sha256);
  assert.equal(before[1].hash,baseline.inputs.json.sha256);
  assert.equal(before[2].hash,baseline.inputs.md.sha256);
  assert.equal(before[3].hash,'168d6bb0a5a957dc2bb797be481f47edf7a9746bf12e01eea4e4bf7cac5ee1e2');
  const oldPreview=fs.readFileSync(path.join(project,'.tmp/ir-wp2/document-ir.v1.json'));
  assert.equal(digest(oldPreview),'6ae3a6574c7ddce186755234c69a565e9166f4aae5b5d282bda7b38fffc7fc1c');
  const initial=JSON.parse(oldPreview);validateDocumentIrV1(initial);
  const ir=proposeIrReconstruction(initial);validateDocumentIrV1(ir);
  assert.equal(ir.pages.length,22);assert.equal(ir.blocks.length,224);
  assert.equal(ir.sourceElements.length,315);
  assert.equal(ir.reconstruction.appliedOperations.length,0);
  assert.equal(ir.chapters.length,0);assert.equal(ir.outputMarkdown.length,0);
  assert.ok(ir.blocks.every(b=>b.audit==='unreviewed'&&b.chapterId===null));
  const input=JSON.parse(fs.readFileSync(ocr,'utf8'));
  assert.deepStrictEqual(reconstructMineruJsonFromIr(ir),input,'semantic source roundtrip');
  const rawRefs=new Set(ir.sourceElements.filter(e=>e.collection==='para_blocks').map(e=>e.id));
  const usedRefs=new Set(ir.blocks.flatMap(b=>b.sources.map(r=>r.elementId)));
  assert.deepStrictEqual([...usedRefs].sort(),[...rawRefs].sort(),'complete body OCR provenance without gaps');
  assert.equal(new Set(ir.blocks.map(b=>b.blockId)).size,ir.blocks.length);
  const proposals=ir.reconstruction.candidates;
  const byKind=Object.fromEntries([...new Set(proposals.map(x=>x.kind))].sort().map(kind=>[kind,proposals.filter(x=>x.kind===kind).length]));
  const evidenceById=new Map(ir.sourceElements.map(e=>[e.id,e]));
  const examples=proposals.slice(0,18).map(p=>({type:p.kind,sourcePages:[...new Set(p.sourceElementIds.map(id=>evidenceById.get(id).pdfPageNumber))],id:p.candidateId}));
  assert.ok(proposals.every(p=>p.status==='needs-review'));
  assert.ok((byKind['cross-page-continuation']??0)>0,'real case should flag at least one possible cross-page continuation');
  assert.ok((byKind['multi-column-order']??0)>0,'real case should flag multi-column order risks');
  // Exercise a real cross-page candidate ONLY in memory, without persisting or claiming it is correct.
  const candidate=proposals.find(p=>p.kind==='cross-page-continuation');
  const leftId=ir.blocks.find(b=>b.sources.some(ref=>ref.elementId===candidate.sourceElementIds[0])).blockId;
  const rightId=ir.blocks.find(b=>b.sources.some(ref=>ref.elementId===candidate.sourceElementIds[1])).blockId;
  const demo=explicitMergeAdjacentTextBlocks(ir,leftId,rightId,'自动化模拟操作，未经过真人审核；不落盘');
  assert.equal(demo.blocks.length,223);
  assert.equal(demo.reconstruction.appliedOperations[0].kind,'merge');
  const mockOriginal=ir.blocks.find(b=>b.blockId===leftId);
  const merged=demo.blocks.find(b=>b.blockId===leftId);
  assert.equal(merged.sources.length,2);
  assert.ok(merged.text.startsWith(mockOriginal.text));
  assert.deepStrictEqual(reconstructMineruJsonFromIr(demo),input);
  const segmentCount=ir.blocks.find(b=>b.type==='text'&&b.text.length>30&&b.sources.length===1&&
    evidenceById.get(b.sources[0].elementId).segments.some(s=>typeof s.content==='string'));
  assert.ok(segmentCount);
  const testSplit=explicitSplitBlockAtUtf16(ir,segmentCount.blockId,Math.floor(segmentCount.text.length/2),'自动化模拟拆分，不落盘');
  assert.equal(testSplit.blocks.length,225);
  assert.deepStrictEqual(reconstructMineruJsonFromIr(testSplit),input);
  assert.equal(ir.reconstruction.appliedOperations.length,0,'demo edits may not pollute the canonical preview');
  const encoded=encodeDocumentIrV1(ir);
  const outputDir=path.join(project,'.tmp/ir-wp3');fs.mkdirSync(outputDir,{recursive:true});
  const outfile=path.join(outputDir,'document-ir.v1.json');let outcome='existing-matched';
  if(fs.existsSync(outfile)){
    assert.deepStrictEqual(fs.readFileSync(outfile),Buffer.from(encoded),'immutable review preview differs');
  }else{
    const fd=fs.openSync(outfile,'wx',0o600);try{fs.writeFileSync(fd,encoded);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}outcome='created';
  }
  const persisted=JSON.parse(fs.readFileSync(outfile,'utf8'));validateDocumentIrV1(persisted);
  assert.deepStrictEqual(reconstructMineruJsonFromIr(persisted),input);
  assert.deepStrictEqual(manifest(originals),before);
  assert.equal(fs.existsSync(path.join(root,'.ocr2md/document-ir.v1.json')),false);
  console.log('IR_WP3_REAL_RECONSTRUCTION_PASS '+JSON.stringify({
    pdfPages:ir.pages.length,sourceElements:ir.sourceElements.length,bodyElements:224,
    logicalDraftBlocks:ir.blocks.length,proposals:proposals.length,byKind,examples,
    simulatedManualMerge:true,simulatedManualSplit:true,appliedToRealPreview:0,
    reconstructedOriginalJson:true,officialMdDependency:false,noVaultWrites:true,
    previewBytes:encoded.length,previewSha256:digest(encoded),preview:outfile,action:outcome
  }));
}catch(e){console.error('IR_WP3_REAL_RECONSTRUCTION_FAIL',e);process.exitCode=1;}
