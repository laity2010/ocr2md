#!/usr/bin/env node
/** One-time V6 start-only block migration. Never rewrites OCR body or evidence.
 * Dry run by default; --apply needs SHA and writes a durable backup atomically.
 */
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,fsyncSync,renameSync,unlinkSync,statSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {resolve,join,dirname,basename} from 'node:path';
import {buildOutline} from '../ui/outline-index.js';
import {buildChapterFiles} from '../ui/chapter-files.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=why=>{throw Error('V6_START_ONLY_REFUSED: '+why)};
const starts=/^<!-- minerujson:block:v1:(\d+):(\d+) -->$/gm;
const ends=/^<!-- minerujson:end:v1:(\d+):(\d+) -->$/gm;
const deletion=/^<!-- minerujson:end:v1:\d+:\d+ -->\n\n/gm;
function embeddedSource(text){
  const source=/<!-- minerujson:source:v1:([a-f0-9]{64})\n([a-zA-Z0-9_\-\n]+)\n-->\s*$/.exec(text);
  if(!source)fail('MinerU source payload missing');
  let raw;
  try{raw=gunzipSync(Buffer.from(source[2].replace(/\s/g,''),'base64url'));}
  catch{fail('original JSON cannot be decoded')}
  if(sha(raw)!==source[1])fail('original JSON SHA mismatch');
  return {raw,sourceHash:source[1]};
}
function transform(old){
  if(old.includes('\r\n'))fail('CRLF conversion is not permitted');
  const blocks=[...old.matchAll(starts)],closing=[...old.matchAll(ends)];
  if(!closing.length)fail('no end markers found; document already migrated');
  const {raw,sourceHash}=embeddedSource(old);
  const json=JSON.parse(raw.toString('utf8'));
  const expected=json.pdf_info.flatMap((page,p)=>page.para_blocks.map((_,b)=>`${p}:${b}`));
  if(blocks.length!==expected.length||closing.length!==expected.length)
    fail(`anchor count mismatch: block=${blocks.length}, end=${closing.length}, JSON=${expected.length}`);
  for(let i=0;i<expected.length;i++){
    const open=blocks[i],end=closing[i];
    if(`${open[1]}:${open[2]}`!==expected[i]||`${end[1]}:${end[2]}`!==expected[i])
      fail(`anchor order mismatch at ${i}`);
    if(open.index>=end.index||(blocks[i+1]&&end.index>=blocks[i+1].index))
      fail(`end marker does not close original block ${expected[i]}`);
  }
  const next=old.replace(deletion,'');
  if([...next.matchAll(ends)].length)fail('end marker not followed by expected blank line');
  if([...next.matchAll(starts)].length!==blocks.length)fail('block start positions changed');
  const afterSource=embeddedSource(next);
  if(afterSource.sourceHash!==sourceHash||!afterSource.raw.equals(raw))fail('original source changed');
  // AG headings and PDF IDs must remain stable. Exported chapter bodies may
  // only lose the same end marker lines as the mother document.
  const previousRows=buildOutline(old),nextRows=buildOutline(next);
  const headingView=rows=>rows.map(({id,title,level,pdfPage,independent})=>
    ({id,title,level,pdfPage,independent}));
  if(JSON.stringify(headingView(previousRows))!==JSON.stringify(headingView(nextRows)))
    fail('headings or PDF attribution changed');
  if(previousRows.length){
    const prevFiles=buildChapterFiles(old,previousRows),nextFiles=buildChapterFiles(next,nextRows);
    if(prevFiles.length!==nextFiles.length)fail('chapter count changed');
    for(let i=0;i<nextFiles.length;i++){
      if(prevFiles[i].name!==nextFiles[i].name||
        prevFiles[i].content.replace(deletion,'')!==nextFiles[i].content)
        fail('chapter content changed except for end markers');
    }
  }
  const annotations=(old.match(/^<!-- ocr2md:chapter:v1 .+ -->$/gm)||[]);
  if(annotations.join('\n')!==(next.match(/^<!-- ocr2md:chapter:v1 .+ -->$/gm)||[]).join('\n'))
    fail('manual chapter annotations changed');
  return {next,blocks:blocks.length,pages:json.pdf_info.length,headings:nextRows.length,
    chapterAnnotations:annotations.length,sourceHash};
}
function main(){
  const args=process.argv.slice(2),arg=flag=>{const i=args.indexOf(flag);return i<0?null:args[i+1]};
  const path=arg('--document');if(!path)fail('--document <path> required');
  const file=resolve(path),oldBytes=readFileSync(file);
  const old=oldBytes.toString('utf8');
  if(!Buffer.from(old,'utf8').equals(oldBytes))fail('invalid UTF-8');
  const beforeSha=sha(oldBytes);
  const {next,...counts}=transform(old);
  const updated=Buffer.from(next,'utf8');
  const result={beforeSha,afterSha:sha(updated),removedBytes:oldBytes.length-updated.length,...counts};
  if(arg('--output')&&args.includes('--apply'))fail('--output and --apply are exclusive');
  if(args.includes('--apply')){
    if(arg('--expected-sha')!==beforeSha)fail('observed --expected-sha required for write');
    const dir=dirname(file),backupDir=join(dir,'.block-start-backups');
    mkdirSync(backupDir,{recursive:true,mode:0o700});
    const nonce=randomBytes(5).toString('hex');
    const backup=join(backupDir,basename(file)+'.'+new Date().toISOString().replace(/[-:.]/g,'')+'.'+nonce+'.bak');
    const fd=openSync(backup,'wx',0o600);
    try{writeFileSync(fd,oldBytes);fsyncSync(fd)}finally{closeSync(fd)}
    const temp=join(dir,'.start-only-'+nonce+'.tmp');
    try{
      const f=openSync(temp,'wx',statSync(file).mode&0o777);
      try{writeFileSync(f,updated);fsyncSync(f)}finally{closeSync(f)}
      if(sha(readFileSync(file))!==beforeSha)fail('concurrent edit detected; backup retained');
      renameSync(temp,file);
    }finally{try{unlinkSync(temp)}catch{}}
    if(sha(readFileSync(file))!==result.afterSha)fail('post-write SHA mismatch');
    result.backup=backup;
    console.log('V6_START_ONLY_APPLIED',JSON.stringify(result));
  }else if(arg('--output')){
    const target=resolve(arg('--output'));
    if(target===file)fail('output must differ from document');
    writeFileSync(target,updated,{flag:'wx',mode:0o600});
    console.log('V6_START_ONLY_STAGED',JSON.stringify({...result,output:target}));
  }else console.log('V6_START_ONLY_DRY_RUN',JSON.stringify(result));
}
try{main()}catch(e){console.error(e.message);process.exitCode=1}
