import * as assert from "assert";
import { extractMineruElements } from "./mineruElementExtractor";
import { mapMineruToChapterDrafts } from "./mineruChapterMapping";
import { buildPdfMdSidecar, decodePdfMdSidecar, encodePdfMdSidecar,
  mappingFilePath, sha256, sidecarSourceFiles, type PdfMdMappingSidecarV1 } from "./mineruMappingSidecar";
import { FixtureWorkspaceRegistry } from "./v3FixtureWorkspaceFs";
import { location, WorkspaceV3Error,
  type WorkspaceFSV3, type WorkspaceCapabilities } from "./workspaceFsV3";
import { savePdfMdSidecar, loadPdfMdSidecar, verifySidecarSources } from "./mineruMappingSidecarStore";

async function run():Promise<void>{
const ws="obsidian-ocr2md",dir="/ocr2md/Demo";
const encoder=new TextEncoder();
const registry=new FixtureWorkspaceRegistry([{workspaceId:ws,label:"WP4 Fixture"}]);
const fs=await registry.open(ws);
let requestCount=0;
async function mkdir(path:string){await fs.commit({workspaceId:ws,requestId:"mkdir-"+ ++requestCount,
  operations:[{type:"create-directory",at:location(ws,path),ifAbsent:true}]});}
async function create(path:string,text:string){await fs.commit({workspaceId:ws,requestId:"file-"+ ++requestCount,
  operations:[{type:"create-file",at:location(ws,path),ifAbsent:true,bytes:encoder.encode(text)}]});}
async function overwrite(path:string,text:string){
  const existing=await fs.stat(location(ws,path));
  await fs.commit({workspaceId:ws,requestId:"replace-"+ ++requestCount,
    operations:[{type:"replace-file",target:existing,expectedRevision:existing.revision,
      bytes:encoder.encode(text)}]});
}
function mappedDoc(path:string,text:string){return {path,text,sha256:sha256(text)};}
async function failed(run:()=>Promise<unknown>,code:WorkspaceV3Error["code"]){
  await assert.rejects(run,err=>err instanceof WorkspaceV3Error && err.code===code,
    `Expected ${code}`);
}
for(const p of ["/ocr2md",dir,dir+"/.ocr2md",dir+"/json",dir+"/md",dir+"/chapters",dir+"/chapters/00"]){
  await mkdir(p);
}
const pdfPath=dir+"/original.pdf",ocrPath=dir+"/json/mineru.json",mdPath=dir+"/md/raw.md";
const chapPath=dir+"/chapters/00/00.md",workingPath=dir+"/chapters/00/00.working.md";
const title="A unique title";const para="The traceable original sentence has a unique home in the working chapter.";
const original="# "+title+"\n\n"+para+"\n";
const chapter="---\nchapter: 00\n---\n\n"+original;
const working="---\nchapter: 00\n---\n\n"+original+"\nNotes.\n";
const rawJson=JSON.stringify({pdf_info:[{page_idx:0,page_size:[594,783],preproc_blocks:[],
  para_blocks:[
    {type:"title",level:1,index:1,bbox:[30,30,220,60],
      lines:[{spans:[{type:"text",content:title}]}]},
    {type:"text",index:2,bbox:[30,80,450,125],
      lines:[{spans:[{type:"text",content:para}]}]},
    {type:"table",index:3,bbox:[30,130,450,300],
      blocks:[{type:"table_caption",bbox:[30,130,450,145],lines:[]},
        {type:"table_body",bbox:[30,150,450,300],lines:[]}]},
  ],discarded_blocks:[{type:"header",bbox:[0,0,30,20],lines:[]}]}]});
await create(pdfPath,"%PDF-1.4 demo fixture");
await create(ocrPath,rawJson);
await create(mdPath,original);
await create(chapPath,chapter);
await create(workingPath,working);
const extracted=extractMineruElements(encoder.encode(rawJson));
const mapped=mapMineruToChapterDrafts(extracted,mappedDoc(mdPath,original),[{
  chapterId:"00",source:mappedDoc(chapPath,chapter),working:mappedDoc(workingPath,working),
}]);
const sidecar=buildPdfMdSidecar(ws,{path:pdfPath,sha256:sha256("%PDF-1.4 demo fixture")},
  {path:ocrPath,sha256:sha256(rawJson)},extracted,mapped);
assert.equal(sidecar.relations.length,3);
assert.equal(sidecar.ignoredDiscardedCount,1);
assert.equal(sidecar.summary["candidate-complete"],2);
assert.equal(sidecar.summary.unavailable,1);
assert.equal(sidecar.relations.filter(r=>r.manuallyVerified).length,0);
assert.equal(sidecarSourceFiles(sidecar).length,5);
assert.equal(mappingFilePath(dir),dir+"/.ocr2md/pdf-md-map.v1.json");
const encoded=encodePdfMdSidecar(sidecar);
assert.deepStrictEqual(decodePdfMdSidecar(encoded),sidecar);
assert.ok(!new TextDecoder().decode(encoded).includes("The traceable original sentence"),
  "Sidecar must not duplicate user Markdown paragraphs");
const invalid=structuredClone(sidecar) as any;
invalid.relations[0].manuallyVerified=true;
assert.throws(()=>encodePdfMdSidecar(invalid),/Malformed/);
const invalidSummary=structuredClone(sidecar) as any;
invalidSummary.summary["candidate-complete"]++;
assert.throws(()=>encodePdfMdSidecar(invalidSummary),/summary mismatch/);
await failed(()=>savePdfMdSidecar(fs,sidecar,{workDirectory:dir,requestId:"",}),"EINVAL");
const outsideBook=structuredClone(sidecar) as any;
outsideBook.pdf.path="/ocr2md/AnotherBook/original.pdf";
await failed(()=>savePdfMdSidecar(fs,outsideBook,{
  workDirectory:dir,requestId:"cross-book-source"}),"EACCES");
const first=await savePdfMdSidecar(fs,sidecar,{workDirectory:dir,requestId:"wp4-create"});
assert.equal(first.status,"created");
assert.equal(first.sourcesStillCurrent,true);
assert.equal(first.sidecarSha256,sha256(encoded));
const loaded=await loadPdfMdSidecar(fs,dir);
assert.equal(loaded.sourcesCurrent,true);
assert.deepStrictEqual(loaded.sidecar,sidecar);
assert.equal(loaded.node.revision,first.node.revision);
await failed(()=>savePdfMdSidecar(fs,sidecar,{workDirectory:dir,requestId:"create-again"}),"ECONFLICT");
await failed(()=>savePdfMdSidecar(fs,sidecar,{workDirectory:dir,requestId:"stale-create",
  expectedSidecarRevision:"r-invalid"}),"ESTALE");
const same=await savePdfMdSidecar(fs,sidecar,{workDirectory:dir,requestId:"wp4-same",
  expectedSidecarRevision:first.node.revision});
assert.equal(same.status,"unchanged");
assert.equal(same.node.revision,first.node.revision);
// A legitimate update needs an explicit current revision. It may only alter
// derived evidence after source hashes are validated, not source files.
const updated=structuredClone(sidecar) as PdfMdMappingSidecarV1;
const asAny=updated as any;
asAny.relations[0].matchStatus="candidate-partial";
asAny.summary["candidate-complete"]--;
asAny.summary["candidate-partial"]++;
const replaced=await savePdfMdSidecar(fs,updated,{workDirectory:dir,requestId:"wp4-replace",
  expectedSidecarRevision:first.node.revision});
assert.equal(replaced.status,"replaced");
assert.notEqual(replaced.node.revision,first.node.revision);
await failed(()=>savePdfMdSidecar(fs,updated,{workDirectory:dir,requestId:"wp4-old-revision",
  expectedSidecarRevision:first.node.revision}),"ESTALE");
// Concurrent source edit invalidates stored evidence. Even with a current
// sidecar revision it must not write a stale source snapshot.
await overwrite(workingPath,working+"\nManual edit after snapshot\n");
assert.equal(await verifySidecarSources(fs,sidecar),false);
assert.equal((await loadPdfMdSidecar(fs,dir)).sourcesCurrent,false);
await failed(()=>savePdfMdSidecar(fs,sidecar,{workDirectory:dir,requestId:"wp4-stale-src",
  expectedSidecarRevision:replaced.node.revision}),"ESTALE");
const priorRevision=(await fs.stat(location(ws,mappingFilePath(dir)))).revision;
assert.equal(priorRevision,replaced.node.revision,"stale source must not overwrite existing sidecar");

// Capability gates. A memory fixture can simulate Mac Vault's absent
// coordinated replacement and protected hidden directory without bypassing it.
const unsupported={...fs,getCapabilities:async()=>({
  ...(await fs.getCapabilities()),casWrites:false,
} as WorkspaceCapabilities)} as WorkspaceFSV3;
await failed(()=>savePdfMdSidecar(unsupported,sidecar,{workDirectory:dir,requestId:"no-cas"}),"EUNSUPPORTED");
const hiddenProtected={...fs,getCapabilities:()=>fs.getCapabilities(),
  stat:async(loc:ReturnType<typeof location>)=>{
    if(loc.path.includes("/.ocr2md"))throw new WorkspaceV3Error("EACCES","Hidden path protected");
    return fs.stat(loc);
  },
} as WorkspaceFSV3;
await failed(()=>savePdfMdSidecar(hiddenProtected,sidecar,{
  workDirectory:dir,requestId:"hidden-not-allowed"}),"EACCES");
const uncoordinated={...fs,getCapabilities:async()=>({
  ...(await fs.getCapabilities()),atomicBatch:false,fileCoordination:false,
} as WorkspaceCapabilities),
  stat:(loc:ReturnType<typeof location>)=>fs.stat(loc),
  readRange:fs.readRange.bind(fs),commit:fs.commit.bind(fs),
} as WorkspaceFSV3;
await failed(()=>savePdfMdSidecar(uncoordinated,sidecar,{
  workDirectory:dir,requestId:"unsupported-replace",
  expectedSidecarRevision:replaced.node.revision}),"EUNSUPPORTED");
const finalLoaded=await loadPdfMdSidecar(fs,dir);
assert.equal(finalLoaded.sourcesCurrent,false);
assert.equal(finalLoaded.sidecar.relations[0].matchStatus,"candidate-partial");
console.log("WP4_SIDECAR_CAS_UNIT_OK",JSON.stringify({
  elements:sidecar.relations.length,sourceFiles:sidecarSourceFiles(sidecar).length,
  firstCreated:true,idempotentNoop:true,casReplacement:true,oldRevisionBlocked:true,
  sourceStaleBlocked:true,macHiddenPathDenied:true,uncoordinatedReplaceDenied:true,
  dataSourceReadOnly:true,
}));
await fs.close();
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
