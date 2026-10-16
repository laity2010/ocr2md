/** Real FS + CLI + core closure. Fixtures exist only in mkdtemp OS temporary directory. */
import * as assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,cpSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {sha256,open,locateMarkdown,locatePdf,locatePdfPoint,importEditedMarkdown,
  exportMarkdown,applyMarkdownEdit} from '../src/core';
import {validateDocumentIrV1} from '../src/ir/documentIrV1';
function miniPdf():Buffer {
  const parts=['%PDF-1.4\n'];const offsets=[0];
  for(const object of [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ]){
    offsets.push(Buffer.byteLength(parts.join(''),'utf8'));
    parts.push(`${offsets.length-1} 0 obj\n${object}\nendobj\n`);
  }
  const xref=Buffer.byteLength(parts.join(''),'utf8');
  parts.push(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for(const offset of offsets.slice(1))parts.push(String(offset).padStart(10,'0')+' 00000 n \n');
  parts.push(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.from(parts.join(''));
}
const span=(text:string)=>[{spans:[{type:'text',content:text}]}];
const source={_backend:'hybrid',_version_name:'3.4.4',pdf_info:[{
  page_idx:0,page_size:[600,800],preproc_blocks:[],discarded_blocks:[],para_blocks:[
    {type:'title',level:1,bbox:[20,30,390,72],lines:span('A Paper')},
    {type:'text',bbox:[20,100,450,155],lines:span('The OCR have errors.')},
    {type:'text',bbox:[20,165,450,208],lines:span('Second paragraph.')},
    {type:'table',bbox:[20,240,500,430],blocks:[{type:'table_body',lines:[{spans:[
      {type:'table',html:'<table><tr><td>A</td></tr></table>'}]}]}]},
  ]}]};
const dir=mkdtempSync(join(tmpdir(),'mopjo-wp1-'));
const originalMineru=join(dir,'mineru.json'),originalPdf=join(dir,'original.pdf'),pkg=join(dir,'package');
const firstMd=join(dir,'first.md'),editMd=join(dir,'human-edit.md'),reopenedMd=join(dir,'reopened.md');
const cli=resolve(process.cwd(),'dist/cli.mjs');
const command=(...args:string[])=>JSON.parse(execFileSync(process.execPath,[cli,...args],{encoding:'utf8'}).trim());
let assertions=0;const prove=(condition:boolean,msg:string)=>{assert.ok(condition,msg);assertions++;};
try{
  const sourceBytes=Buffer.from(JSON.stringify(source));const pdfBytes=miniPdf();
  writeFileSync(originalMineru,sourceBytes);writeFileSync(originalPdf,pdfBytes);
  const originalMineruHash=sha256(sourceBytes),originalPdfHash=sha256(pdfBytes);
  prove(sourceBytes.length>200&&pdfBytes.toString().startsWith('%PDF-1.4'),'real MinerU structure and PDF file');
  assert.equal(command('init',originalMineru,originalPdf,pkg).status,'MOPJO_INIT_OK');assertions++;
  const baselinePath=join(pkg,'original.dir.json'),deltaPath=join(pkg,'changes.json');
  const initialBaseline=readFileSync(baselinePath),initialDelta=readFileSync(deltaPath);
  const baseline=JSON.parse(initialBaseline.toString());validateDocumentIrV1(baseline);
  const delta0=JSON.parse(initialDelta.toString());
  prove(baseline.blocks.length===4&&delta0.operations.length===0,'four OCR blocks, empty delta');
  prove(delta0.originalDirSha256===sha256(initialBaseline),'baseline SHA binds exact source bytes');
  prove(baseline.pdf.sha256===originalPdfHash,'PDF SHA bound to DIRjson');
  prove(baseline.ocr.sha256===originalMineruHash,'OCR SHA bound to DIRjson');
  assert.equal(command('render',pkg,originalPdf,firstMd).status,'MOPJO_RENDER_OK');assertions++;
  const originalView=readFileSync(firstMd,'utf8');
  prove(originalView.startsWith('<!-- mopjo:state-sha256=')&&originalView.includes('The OCR have errors.'),
    'MD generated with its source generation and text');
  const firstOpened=open(baseline,delta0,pdfBytes);
  const bodyId=baseline.blocks[1].blockId;
  const pdfLoc0=locatePdf(firstOpened,bodyId);
  prove(pdfLoc0.pages.join(',')==='1'&&pdfLoc0.regions.length===1,'original PDF target available');
  const normalized=pdfLoc0.regions[0].normalizedBBox;
  const centerX=(normalized[0]+normalized[2])/2,centerY=(normalized[1]+normalized[3])/2;
  assert.deepEqual(locatePdfPoint(firstOpened,1,centerX,centerY),{kind:'unique',blockId:bodyId});assertions++;
  const mdLoc0=locateMarkdown(firstOpened,bodyId);
  prove(firstOpened.markdown.content.slice(mdLoc0.from,mdLoc0.to)==='The OCR have errors.',
    'Markdown interval maps to stable block ID');
  const edited=originalView.replace('The OCR have errors.','The OCR has errors.');
  prove(edited!==originalView,'real one-block edit');
  writeFileSync(editMd,edited);
  assert.equal(command('edit',pkg,originalPdf,editMd).status,'MOPJO_EDIT_OK');assertions++;
  prove(JSON.parse(readFileSync(deltaPath,'utf8')).operations.length===1,'edit persisted only in delta JSON');
  assert.equal(command('render',pkg,originalPdf,reopenedMd).status,'MOPJO_RENDER_OK');assertions++;
  const reopenedView=readFileSync(reopenedMd,'utf8');
  prove(reopenedView.includes('The OCR has errors.')&&!reopenedView.includes('have errors.'),
    'regenerated Markdown exactly reflects delta');
  const reopened=open(baseline,JSON.parse(readFileSync(deltaPath,'utf8')),pdfBytes);
  assert.equal(exportMarkdown(reopened),reopenedView,'reopened MD byte-for-byte equals regenerated output');assertions++;
  assert.deepEqual(locatePdf(reopened,bodyId),pdfLoc0,'PDF bbox survives edit');assertions++;
  prove(locateMarkdown(reopened,bodyId).from===mdLoc0.from,'block ID and document position stable');
  // Second sequential operation changes a title, replay must include both edits.
  const secondDraft=reopenedView.replace('# A Paper','# A Review');
  prove(secondDraft!==reopenedView,'second title edit from current generation');
  writeFileSync(editMd,secondDraft);
  assert.equal(command('edit',pkg,originalPdf,editMd).operations,2);assertions++;
  const twiceMd=join(dir,'twice.md');command('render',pkg,originalPdf,twiceMd);
  const twiceView=readFileSync(twiceMd,'utf8');
  const reopenedTwice=open(baseline,JSON.parse(readFileSync(deltaPath,'utf8')),pdfBytes);
  assert.equal(exportMarkdown(reopenedTwice),twiceView);assertions++;
  prove(twiceView.includes('# A Review')&&twiceView.includes('The OCR has errors.'),
    'both operations are independently replayed');
  assert.deepEqual(locatePdf(reopenedTwice,bodyId),pdfLoc0);assertions++;
  const frozenDelta=readFileSync(deltaPath);
  assert.throws(()=>importEditedMarkdown(reopenedTwice,edited),/STALE_MARKDOWN_VIEW/);assertions++;
  const staleFile=join(dir,'stale.md');writeFileSync(staleFile,secondDraft);
  const staleRun=spawnSync(process.execPath,[cli,'edit',pkg,originalPdf,staleFile],{encoding:'utf8'});
  prove(staleRun.status!==0&&staleRun.stderr.includes('STALE_MARKDOWN_VIEW'),
    'CLI refuses stale MD and preserves delta');
  assert.throws(()=>applyMarkdownEdit(reopened,reopened.markdown.content.replace(/<!-- ocr2md-ir:block=[^>]+ -->\n/u,'')));
  assertions++;
  assert.throws(()=>applyMarkdownEdit(reopened,reopened.markdown.content
    .replace('The OCR has errors.','Modified one.').replace('Second paragraph.','Modified two.')),
    /EDIT_REQUIRES_ONE_ANCHORED_BLOCK/);assertions++;
  assert.throws(()=>applyMarkdownEdit(reopened,reopened.markdown.content
    .replace('<table><tr><td>A</td></tr></table>','<table><tr><td>B</td></tr></table>')),
    /富媒体块暂不支持/);assertions++;
  const wrongPdf=Buffer.from(pdfBytes);wrongPdf[7]=wrongPdf[7]===0x34?0x35:0x34;
  assert.throws(()=>open(baseline,JSON.parse(frozenDelta.toString()),wrongPdf),/PDF_CHANGED/);assertions++;
  const corrupted={...JSON.parse(frozenDelta.toString()),operations:[{...JSON.parse(frozenDelta.toString()).operations[0],afterStateSha256:'0'.repeat(64)}]};
  assert.throws(()=>open(baseline,corrupted,pdfBytes),/OP_RESULT_MISMATCH/);assertions++;
  const corruptedPkg=join(dir,'tampered');cpSync(pkg,corruptedPkg,{recursive:true});
  writeFileSync(join(corruptedPkg,'original.dir.json'),Buffer.concat([initialBaseline,Buffer.from(' ')]));
  const corruptRun=spawnSync(process.execPath,[cli,'render',corruptedPkg,originalPdf,join(dir,'should-not-exist.md')],
    {encoding:'utf8'});
  prove(corruptRun.status!==0&&corruptRun.stderr.includes('BASELINE_BYTES_CHANGED'),
    'tampered immutable baseline blocked at CLI boundary');
  prove(!existsSync(join(dir,'should-not-exist.md')),'damaged baseline never materializes MD');
  prove(readFileSync(deltaPath).equals(frozenDelta),'rejected operations never changed delta file');
  prove(readFileSync(baselinePath).equals(initialBaseline),'immutable baseline untouched throughout');
  prove(sha256(readFileSync(originalMineru))===originalMineruHash&&
    sha256(readFileSync(originalPdf))===originalPdfHash,'raw OCR JSON and PDF original bytes untouched');
  prove(!existsSync(join(pkg,'chapter.md'))&&!existsSync(join(pkg,'edited.md')),
    'no materialized Markdown stored as authoritative content');
  console.log('MOPJO_WP1_ROUNDTRIP_PASS',JSON.stringify({assertions,blocks:baseline.blocks.length,
    operations:reopenedTwice.delta.operations.length,originalDirSha256:sha256(initialBaseline),
    pdfSha256:originalPdfHash,markdownSha256:sha256(twiceView),
    pdfPosition:pdfLoc0.regions[0].bbox,immutableSources:true,reopenDeterministic:true,
    unsafeOperationsRejected:true}));
}finally{rmSync(dir,{recursive:true,force:true});}
