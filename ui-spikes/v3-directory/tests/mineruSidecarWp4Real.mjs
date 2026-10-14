/** WP4 REAL-CORPUS READ-ONLY SIDE CAR DRY RUN.
 * Never calls WorkspaceFS.commit or writes to the iCloud/Obsidian directory.
 * Usage: npm run test:mapping:real -- "<Bufett’s Alpha folder>"
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import extractor from "../../../.tmp/wp4/mineruElementExtractor.js";
import chapterMapper from "../../../.tmp/wp4/mineruChapterMapping.js";
import sidecarModule from "../../../.tmp/wp4/mineruMappingSidecar.js";
import storeModule from "../../../.tmp/wp4/mineruMappingSidecarStore.js";
import fsContract from "../../../.tmp/wp4/workspaceFsV3.js";
const {extractMineruElements}=extractor;
const {mapMineruToChapterDrafts}=chapterMapper;
const {buildPdfMdSidecar,decodePdfMdSidecar,encodePdfMdSidecar,
  sidecarSourceFiles,sha256,mappingFilePath}=sidecarModule;
const root=process.argv[2]||process.env.OCR2MD_PDF_MD_CASE_ROOT;
if(!root)throw Error('Usage: node tests/mineruSidecarWp4Real.mjs "<book directory>"');
const here=dirname(fileURLToPath(import.meta.url));
const base=JSON.parse(await readFile(resolve(here,"fixtures/buffett-alpha-wp0.json"),"utf8"));
const wp3=JSON.parse(await readFile(resolve(here,"fixtures/buffett-alpha-wp3.json"),"utf8"));
const rootLogical="/ocr2md/Bufett’s Alpha";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const trackedPaths=[...Object.values(base.inputs).map(x=>x.relativePath),
  ".ocr2md-merged.working.md"];
for(const directory of await readdir(resolve(root,"chapters"),{withFileTypes:true})){
  if(!directory.isDirectory())continue;
  const nested="chapters/"+directory.name;
  for(const f of await readdir(resolve(root,nested),{withFileTypes:true})){
    if(f.isFile()&&f.name.endsWith(".md"))trackedPaths.push(nested+"/"+f.name);
  }
}
const tracked=[...new Set(trackedPaths)].sort();
const snapshot=async()=>Object.fromEntries(await Promise.all(tracked.map(async path=>[
  path,sha(await readFile(resolve(root,path))),
])));
const before=await snapshot();
const jsonBuffer=await readFile(resolve(root,base.inputs.json.relativePath));
const index=extractMineruElements(new Uint8Array(jsonBuffer));
assert.equal(index.sourceSha256,base.inputs.json.sha256);
const originalBuffer=await readFile(resolve(root,base.inputs.md.relativePath));
const originalMd={path:rootLogical+"/"+base.inputs.md.relativePath,
  text:originalBuffer.toString("utf8"),sha256:sha(originalBuffer)};
const pairs=[];
for(const row of wp3.chapters){
  const readDoc=async spec=>{
    const bytes=await readFile(resolve(root,spec.path));
    assert.equal(sha(bytes),spec.sha256,`WP3 frozen chapter changed: ${spec.path}`);
    return {path:rootLogical+"/"+spec.path.replaceAll(sep,"/"),
      text:bytes.toString("utf8"),sha256:sha(bytes)};
  };
  pairs.push({chapterId:row.chapterId,source:await readDoc(row.source),
    working:await readDoc(row.working)});
}
const chapterMapping=mapMineruToChapterDrafts(index,originalMd,pairs);
const pdfHash=sha(await readFile(resolve(root,base.inputs.pdf.relativePath)));
const sidecar=buildPdfMdSidecar("obsidian-ocr2md",
  {path:rootLogical+"/"+base.inputs.pdf.relativePath,sha256:pdfHash},
  {path:rootLogical+"/"+base.inputs.json.relativePath,sha256:sha(jsonBuffer)},
  index,chapterMapping);
const bytes=encodePdfMdSidecar(sidecar);
const roundtrip=decodePdfMdSidecar(bytes);
assert.deepEqual(roundtrip,sidecar);
assert.equal(bytes.length<=512*1024,true,"real sidecar exceeds MacVault create-file size");
assert.equal(sidecar.relations.length,224);
assert.equal(sidecar.ignoredDiscardedCount,91);
assert.deepEqual(sidecar.summary,wp3.statusCounts);
assert.equal(sidecar.relations.filter(r=>r.manuallyVerified!==false).length,0);
const expectedSources=3+wp3.chapters.length*2;
const sources=sidecarSourceFiles(sidecar);
assert.equal(sources.length,expectedSources);
for(const source of sources){
  assert.ok(source.path.startsWith(rootLogical+"/"));
  const relative=source.path.slice(rootLogical.length+1);
  const hash=sha(await readFile(resolve(root,relative)));
  assert.equal(hash,source.sha256,`Sidecar source snapshot mismatch ${relative}`);
}
for(const page of [8,11]){
  assert.ok(sidecar.relations.some(r=>r.pdfRegions.some(x=>x.pdfPageNumber===page&&
    x.pageSize[0]===783&&x.pageSize[1]===594)),
    "rotated PDF visual page coordinates must be retained");
}
assert.equal(sidecar.relations.filter(r=>r.type==="table"&&r.matchStatus==="unavailable").length,1);
const after=await snapshot();
assert.deepEqual(after,before,"No PDF, OCR JSON, MD or working draft may be modified");
const commitRequested=process.argv.includes("--commit");
let saveReport={realVaultSaveStatus:"DRY_RUN_ONLY",wroteToObsidian:false};
if(commitRequested){
  // Live write is ONLY through the authorized local Mac Vault HTTP transport.
  // No native direct file copy/rename to the iCloud directory.
  const baseUrl="http://127.0.0.1:4176";
  const workspaceId="obsidian-ocr2md";
  const {WorkspaceV3Error}=fsContract;
  async function request(url,post){
    const response=await fetch(baseUrl+url,{
      ...(post?{method:"POST",body:JSON.stringify(post)}:{}),
      headers:post?{"Origin":baseUrl,"Content-Type":"application/json"}:{},
    });
    let result;
    try{result=await response.json();}
    catch{throw new WorkspaceV3Error("EOFFLINE","Mac Vault returned invalid JSON");}
    if(!response.ok)throw new WorkspaceV3Error(result.code||"EOFFLINE",
      result.error||("HTTP "+response.status));
    return result;
  }
  const endpoint=(op,path,options={})=>
    "/__v3/fs?"+new URLSearchParams({op,path,...options}).toString();
  const fs={
    workspaceId,
    getCapabilities:()=>request("/__v3/fs?op=capabilities"),
    stat:at=>request(endpoint("stat",at.path)),
    readRange:async(ref,range)=>{
      const result=await request(endpoint("read",ref.path,{
        nodeId:ref.nodeId,revision:range.expectedRevision||"",
        offset:String(range.offset),length:String(range.length),
      }));
      return {bytes:new Uint8Array(Buffer.from(result.base64,"base64")),
        revision:result.revision,totalBytes:result.totalBytes};
    },
    commit:async(req)=>{
      const operations=req.operations.map(op=>{
        if(op.type==="create-file" || op.type==="replace-file"){
          const {bytes,...other}=op;
          return {...other,base64:Buffer.from(bytes).toString("base64")};
        }
        throw Error("Only sidecar file create/replace is permitted");
      });
      return request("/__v3/fs/commit",{...req,operations});
    },
  };
  const {savePdfMdSidecar,loadPdfMdSidecar}=storeModule;
  const sidecarPath=mappingFilePath(rootLogical);
  let existing;
  try{existing=await fs.stat({workspaceId,path:sidecarPath});}
  catch(error){
    if(!(error instanceof WorkspaceV3Error && error.code==="ENOENT"))throw error;
  }
  const save=await savePdfMdSidecar(fs,sidecar,{
    workDirectory:rootLogical,
    requestId:"wp4-real-"+randomUUID(),
    ...(existing?{expectedSidecarRevision:existing.revision}:{}),
  });
  assert.equal(save.sourcesStillCurrent,true,"Source changed during sidecar commit");
  const reloaded=await loadPdfMdSidecar(fs,rootLogical);
  assert.equal(reloaded.sourcesCurrent,true,"Source changed during sidecar reload");
  assert.equal(reloaded.sidecarSha256,sha256(bytes),"Persisted sidecar hash differs");
  assert.deepEqual(reloaded.sidecar,sidecar);
  saveReport={realVaultSaveStatus:"SAVED_AND_RELOADED",
    wroteToObsidian:true,saveMode:save.status,revision:save.node.revision};
}
const afterCommit=await snapshot();
assert.deepEqual(afterCommit,before,"Saving a sidecar must never mutate the PDF, JSON, MD or working drafts");
console.log(JSON.stringify({
  status:commitRequested?"WP4_SIDECAR_REAL_COMMIT_PASS":"WP4_SIDECAR_REAL_DRY_RUN_PASS",
  ...saveReport,sidecarPath:mappingFilePath(rootLogical),
  sidecarBytes:bytes.length,sidecarSha256:sha256(bytes),
  macVaultSingleFileLimitBytes:512*1024,
  relations:sidecar.relations.length,
  sourceFiles:sources.length,sourceFileHashesVerified:true,
  summary:sidecar.summary,
  discardedPreserved:index.discardedElements.length,
  rotatedPages:[8,11],
  trackedSourceFilesUnchanged:tracked.length,
  approvedRelations:0,
},null,2));
