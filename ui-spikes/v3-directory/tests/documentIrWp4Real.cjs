/** IR-WP4 real book: derive provisional outline from OCR-only WP3 IR.
 * Read original PDF/JSON for immutable baseline verification, NEVER read legacy MD as an input.
 * Output to repo-local .tmp only. No vault writes.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'../../..');
const root='/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha';
const c=path.join(project,'.tmp/ir-wp4/compiled');
const {validateDocumentIrV1,encodeDocumentIrV1}=require(path.join(c,'documentIrV1.js'));
const {reconstructMineruJsonFromIr}=require(path.join(c,'documentIrImport.js'));
const {proposeIrChapters,listIrChapterTree,explicitMoveChapterBoundary,
  explicitRenameChapter,explicitDemoteLeafSection,explicitPromoteTitleToSection}=require(path.join(c,'documentIrChapters.js'));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const beforeFiles=[
  path.join(root,'Buffett s Alpha.pdf'),
  path.join(root,'json/MinerU_Buffett s Alpha__20261008112941.json'),
  path.join(root,'md/MinerU_markdown_Buffett_s_Alpha_2108158143412957184.md'),
  path.join(root,'.ocr2md/pdf-md-map.v1.json'),
];
const snapshot=files=>files.map(p=>{const stat=fs.statSync(p);return {path:p,size:stat.size,mtimeMs:stat.mtimeMs,sha256:digest(fs.readFileSync(p))};});
const before=snapshot(beforeFiles);
try{
  const expected=[
    'be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab',
    'e7371434b168a68c77e8b26370327670abb150aed63f2989c9f5e7e4336ee4a5',
    '0554d4d574b9be83b0a22d03f969b3fa88f30cdcfed8420b97c36f8590569da4',
    '168d6bb0a5a957dc2bb797be481f47edf7a9746bf12e01eea4e4bf7cac5ee1e2',
  ];
  before.forEach((v,i)=>assert.equal(v.sha256,expected[i],'modified prior input '+beforeFiles[i]));
  const wp3=fs.readFileSync(path.join(project,'.tmp/ir-wp3/document-ir.v1.json'));
  assert.equal(digest(wp3),'99dec9270a967cc4c195dad4ca3cdd5a89455d9b0bea07b71c25056decb6dd68');
  const doc=JSON.parse(wp3.toString());validateDocumentIrV1(doc);
  const outlined=proposeIrChapters(doc);validateDocumentIrV1(outlined);
  const tree=listIrChapterTree(outlined);
  const rootChapters=tree.length,subsections=outlined.chapters.filter(ch=>ch.depth===2).length;
  const candidates=outlined.chapterStructure.candidates;
  const titleCount=outlined.blocks.filter(b=>b.type==='title').length;
  assert.equal(rootChapters,6,'frontmatter, main article, Appendix A/B/C, references');
  assert.equal(subsections,13,'OCR-derived 13 visible text headings as provisional sections');
  assert.equal(outlined.chapters.length,19);
  assert.equal(titleCount,21);
  assert.equal(candidates.length,titleCount);
  assert.equal(candidates.filter(x=>x.proposedRole==='uncertain').length,2,'author byline candidates');
  assert.equal(candidates.filter(x=>x.status!=='needs-review').length,0);
  assert.equal(outlined.chapterStructure.operations.length,0);
  assert.equal(outlined.blocks.length,224);
  assert.equal(outlined.sourceElements.length,315);
  assert.equal(outlined.reconstruction.candidates.length,17);
  assert.equal(outlined.reconstruction.appliedOperations.length,0);
  assert.ok(outlined.blocks.every(b=>typeof b.chapterId==='string'&&b.audit==='unreviewed'));
  assert.ok(outlined.chapters.every(ch=>ch.status==='provisional'));
  assert.equal(outlined.outputMarkdown.length,0);
  assert.equal(tree.reduce((sum,n)=>sum+n.subtreeBlocks,0),224,'root subtree coverage');
  assert.deepEqual(tree.map(n=>n.label),[
    '前置内容（待审核）','Buffett’s Alpha',
    'Appendix A: Data Sources and Methodology',
    'Appendix B: Decomposing Berkshire Hathaway’s Returns',
    'Appendix C: Implementable Systematic Buffett Strategies','References'
  ]);
  const ocr=JSON.parse(fs.readFileSync(beforeFiles[1],'utf8'));
  assert.deepStrictEqual(reconstructMineruJsonFromIr(outlined),ocr);
  const evidenceIds=new Set(outlined.sourceElements.filter(e=>e.collection==='para_blocks').map(e=>e.id));
  const linked=new Set(outlined.blocks.flatMap(b=>b.sources.map(r=>r.elementId)));
  assert.deepEqual([...linked].sort(),[...evidenceIds].sort());
  // Explicit edits exercise real-book boundaries, never writing modified variants.
  const main=outlined.chapters.find(ch=>ch.name==='Buffett’s Alpha'&&ch.depth===1);
  assert.ok(main);
  const anchorPos=outlined.blocks.findIndex(b=>b.blockId===main.anchorBlockId);
  const moved=explicitMoveChapterBoundary(outlined,main.chapterId,
    outlined.blocks[anchorPos+1].blockId,'纯内存边界调整模拟，尚无人工作业');
  assert.equal(moved.blocks[anchorPos].chapterId,tree[0].chapterId);
  assert.equal(moved.blocks[anchorPos+1].chapterId,main.chapterId);
  const renamed=explicitRenameChapter(outlined,main.chapterId,'Corrected heading in memory','人工改名操作接口隔离模拟');
  assert.equal(renamed.chapters.find(ch=>ch.chapterId===main.chapterId).name,'Corrected heading in memory');
  const leaf=outlined.chapters.find(ch=>ch.depth===2);
  const demoted=explicitDemoteLeafSection(outlined,leaf.chapterId,'小节退回测试，仅内存');
  const promoted=explicitPromoteTitleToSection(demoted,leaf.anchorBlockId,leaf.parentChapterId,'恢复小节测试');
  assert.equal(promoted.chapters.find(ch=>ch.chapterId===leaf.chapterId).chapterId,leaf.chapterId);
  for(const sample of [moved,renamed,demoted,promoted]){
    validateDocumentIrV1(sample);
    assert.deepStrictEqual(reconstructMineruJsonFromIr(sample),ocr);
    assert.equal(sample.blocks.length,224);
    assert.equal(sample.outputMarkdown.length,0);
  }
  const out=path.join(project,'.tmp/ir-wp4/document-ir.v1.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  const encoded=encodeDocumentIrV1(outlined);
  let outcome='existing-matched';
  if(fs.existsSync(out))assert.deepStrictEqual(fs.readFileSync(out),Buffer.from(encoded),'changed preview blocked');
  else{
    const fd=fs.openSync(out,'wx',0o600);
    try{fs.writeFileSync(fd,encoded);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    outcome='created';
  }
  const persisted=JSON.parse(fs.readFileSync(out,'utf8'));
  validateDocumentIrV1(persisted);
  assert.deepStrictEqual(listIrChapterTree(persisted),tree);
  assert.deepStrictEqual(reconstructMineruJsonFromIr(persisted),ocr);
  assert.deepStrictEqual(snapshot(beforeFiles),before,'source files changed');
  assert.equal(fs.existsSync(path.join(root,'.ocr2md/document-ir.v1.json')),false,'no Vault sidecar');
  const summary={pdfPages:outlined.pages.length,sourceElements:outlined.sourceElements.length,
    bodyBlocks:outlined.blocks.length,roots:rootChapters,sections:subsections,
    titleCandidates:candidates.length,uncertainTitles:2,chapterProposalsNeedingReview:candidates.length,
    openWp3Candidates:outlined.reconstruction.candidates.length,appliedChapterEdits:0,
    generatedMarkdown:0,allBlocksAssigned:true,noOfficialMdDependency:true,
    originalJsonRoundtrip:true,simulationIsolated:true,sourceUnchanged:true,
    outline:tree.map(n=>({chapter:n.label,pdfPages:n.pdfPages,blocks:n.subtreeBlocks,sections:n.children.length})),
    irBytes:encoded.length,irSha256:digest(encoded),preview:out,previewAction:outcome};
  console.log('IR_WP4_REAL_CHAPTERS_PASS '+JSON.stringify(summary));
}catch(error){console.error('IR_WP4_REAL_CHAPTERS_FAIL',error);process.exitCode=1;}
