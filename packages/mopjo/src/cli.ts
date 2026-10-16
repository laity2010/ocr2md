/** MOPJO offline CLI: all IO isolated here; document core remains pure. */
import {readFileSync,writeFileSync,existsSync,mkdtempSync,renameSync,rmSync} from 'node:fs';
import {basename,dirname,join,resolve,sep} from 'node:path';
import {importOriginal,emptyDelta,open,locatePdf,locatePdfPoint,
  encodeDelta,sha256,exportMarkdown,importEditedMarkdown,applyElementOperation,queryElements} from './core';
import {encodeDocumentIrV1,validateDocumentIrV1} from './ir/documentIrV1';
import {chapterCli} from './chapterCli';
const enc=new TextEncoder();
const asBytes=(p:string)=>new Uint8Array(readFileSync(p));
const part=(p:string,name:string)=>join(resolve(p),name);
function load(directory:string,pdfPath:string){
  const raw=asBytes(part(directory,'original.dir.json'));
  const deltaRaw=asBytes(part(directory,'changes.json'));
  const doc=JSON.parse(new TextDecoder().decode(raw));validateDocumentIrV1(doc);
  const delta=JSON.parse(new TextDecoder().decode(deltaRaw));
  if(sha256(raw)!==delta.originalDirSha256)throw Error('MOPJO BASELINE_BYTES_CHANGED');
  return {opened:open(doc,delta,asBytes(pdfPath)),deltaRaw};
}
function updateAtomic(p:string,next:Uint8Array,previous:Uint8Array){
  if(!Buffer.from(readFileSync(p)).equals(Buffer.from(previous)))throw Error('MOPJO DELTA_CONCURRENT_CHANGE');
  const temp=mkdtempSync(join(dirname(p),'.mopjo-edit-'));
  try{
    const staged=join(temp,'changes.json');writeFileSync(staged,next,{flag:'wx'});
    if(!Buffer.from(readFileSync(p)).equals(Buffer.from(previous)))throw Error('MOPJO DELTA_CONCURRENT_CHANGE');
    renameSync(staged,p);
  }finally{rmSync(temp,{recursive:true,force:true});}
}
function logicalName(value:string){return '/mopjo/'+basename(value).replace(/[\\/]/g,'_');}
export function cli(argv:string[]):void {
  const [cmd,...args]=argv;
  if(chapterCli(cmd,args))return;
  if(cmd==='init'){
    if(args.length!==3)throw Error('usage: init <mineru.json> <original.pdf> <new-package-directory>');
    const [mineruPath,pdfPath,output]=args;
    if(existsSync(output))throw Error('MOPJO TARGET_EXISTS');
    const doc=importOriginal(asBytes(mineruPath),asBytes(pdfPath),logicalName(pdfPath),logicalName(mineruPath));
    const parent=dirname(resolve(output));
    const staging=mkdtempSync(join(parent,'.mopjo-new-'));
    try{
      writeFileSync(join(staging,'original.dir.json'),encodeDocumentIrV1(doc),{flag:'wx'});
      writeFileSync(join(staging,'changes.json'),encodeDelta(emptyDelta(doc)),{flag:'wx'});
      if(existsSync(output))throw Error('MOPJO TARGET_EXISTS');
      renameSync(staging,output);
    }finally{if(existsSync(staging))rmSync(staging,{recursive:true,force:true});}
    process.stdout.write(JSON.stringify({status:'MOPJO_INIT_OK',dir:resolve(output),
      blocks:doc.blocks.length,originalDirSha256:sha256(encodeDocumentIrV1(doc)),pdfSha256:doc.pdf.sha256})+'\n');
  }else if(cmd==='init-ir'){
    if(args.length!==3)throw Error('usage: init-ir <immutable DIRjson file> <original.pdf> <new-package-directory>');
    const [irPath,pdfPath,output]=args;
    if(existsSync(output))throw Error('MOPJO TARGET_EXISTS');
    const irRaw=asBytes(irPath),doc=JSON.parse(new TextDecoder().decode(irRaw));
    validateDocumentIrV1(doc);
    if(sha256(irRaw)!==sha256(encodeDocumentIrV1(doc)))
      throw Error('MOPJO BASELINE_NOT_CANONICAL');
    if(sha256(asBytes(pdfPath))!==doc.pdf.sha256)throw Error('MOPJO PDF_CHANGED');
    const staging=mkdtempSync(join(dirname(resolve(output)),'.mopjo-new-'));
    try{
      writeFileSync(join(staging,'original.dir.json'),irRaw,{flag:'wx'});
      writeFileSync(join(staging,'changes.json'),encodeDelta(emptyDelta(doc)),{flag:'wx'});
      if(existsSync(output))throw Error('MOPJO TARGET_EXISTS');
      renameSync(staging,output);
    }finally{if(existsSync(staging))rmSync(staging,{recursive:true,force:true});}
    process.stdout.write(JSON.stringify({status:'MOPJO_INIT_IR_OK',blocks:doc.blocks.length,
      originalDirSha256:sha256(irRaw),pdfSha256:doc.pdf.sha256})+'\n');
  }else if(cmd==='elements'){
    if(args.length!==2&&args.length!==3)throw Error('usage: elements <package-directory> <original.pdf> [type]');
    const {opened}=load(args[0],args[1]);
    process.stdout.write(JSON.stringify({status:'MOPJO_ELEMENTS_OK',
      elements:queryElements(opened,args[2]?{type:args[2]}:{})})+'\n');
  }else if(cmd==='operate'){
    if(args.length!==3)throw Error('usage: operate <package-directory> <original.pdf> <operation.json>');
    const {opened,deltaRaw}=load(args[0],args[1]);
    const request=JSON.parse(readFileSync(args[2],'utf8'));
    const updated=applyElementOperation(opened,request);
    updateAtomic(part(args[0],'changes.json'),encodeDelta(updated.delta),deltaRaw);
    process.stdout.write(JSON.stringify({status:'MOPJO_OPERATE_OK',operations:updated.delta.operations.length,
      markdownSha256:sha256(updated.markdown.content)})+'\n');
  }else if(cmd==='render'){
    if(args.length!==3)throw Error('usage: render <package-directory> <original.pdf> <output.md>');
    const {opened}=load(args[0],args[1]);
    // Derived export only; the original/changes pair is the sole authority.
    writeFileSync(args[2],enc.encode(exportMarkdown(opened)));
    process.stdout.write(JSON.stringify({status:'MOPJO_RENDER_OK',sha256:sha256(opened.markdown.content),
      blocks:opened.markdown.ranges.length,operations:opened.delta.operations.length})+'\n');
  }else if(cmd==='edit'){
    if(args.length!==3)throw Error('usage: edit <package-directory> <original.pdf> <human-edited.md>');
    const {opened,deltaRaw}=load(args[0],args[1]);
    const modified=readFileSync(args[2],'utf8');
    const updated=importEditedMarkdown(opened,modified);
    if(updated===opened)throw Error('MOPJO NO_CHANGES');
    updateAtomic(part(args[0],'changes.json'),encodeDelta(updated.delta),deltaRaw);
    process.stdout.write(JSON.stringify({status:'MOPJO_EDIT_OK',operations:updated.delta.operations.length,
      markdownSha256:sha256(updated.markdown.content)})+'\n');
  }else if(cmd==='locate'){
    if(args.length!==3)throw Error('usage: locate <package-directory> <original.pdf> <block-id>');
    const {opened}=load(args[0],args[1]);
    process.stdout.write(JSON.stringify({status:'MOPJO_LOCATE_OK',...locatePdf(opened,args[2])})+'\n');
  }else if(cmd==='point'){
    if(args.length!==5)throw Error('usage: point <package-directory> <original.pdf> <page> <normalized-x> <normalized-y>');
    const {opened}=load(args[0],args[1]);
    process.stdout.write(JSON.stringify(locatePdfPoint(opened,Number(args[2]),Number(args[3]),Number(args[4])))+'\n');
  }else throw Error('usage: mopjo <init|init-ir|elements|operate|render|edit|locate|point> ...');
}
if(process.argv[1]?.endsWith(sep+'cli.mjs')){
  try{cli(process.argv.slice(2));}catch(error){console.error(String(error));process.exitCode=1;}
}
