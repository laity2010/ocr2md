#!/usr/bin/env node
/** One-time additive migration for V6's existing edited mother document.
 * Keep all original text and V6 chapter annotations byte-for-byte; insert only
 * the audit comments generated from the original JSON embedded in that MD.
 * No silent in-place writes: --apply requires an exact observed SHA-256, and
 * stores a durable pre-migration backup before an atomic same-directory swap.
 */
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,fsyncSync,renameSync,unlinkSync,statSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {resolve,join,dirname,basename} from 'node:path';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';

const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=why=>{throw new Error('V6_ANNOTATE_REFUSED: '+why)};
function migrate(old){
  if(old.includes('<!-- minerujson:audit:v1:complete -->'))fail('already contains complete audit');
  const match=/<!-- minerujson:source:v1:([a-f0-9]{64})\n([a-zA-Z0-9_\-\n]+)\n-->\s*$/.exec(old);
  if(!match)fail('embedded original MinerU source missing');
  let original;
  try{original=gunzipSync(Buffer.from(match[2].replace(/\s+/g,''),'base64url')).toString('utf8');}
  catch{fail('embedded original MinerU source cannot be decoded');}
  if(hash(original)!==match[1])fail('embedded source SHA mismatch');
  const data=JSON.parse(original);
  const generated=toMarkdown(original);
  if(toMineruJSON(generated)!==original)fail('generated converter does not round-trip byte-identically');
  let output=old;
  const parts=[];
  let anchorCount=0;
  for(const [page,info] of data.pdf_info.entries()){
    if(!info.para_blocks.length)fail('cannot migrate a page with no paragraph anchors: '+(page+1));
    const anchor=`<!-- minerujson:block:v1:${page}:0 -->`;
    const first=generated.indexOf(anchor);
    const auditStart=page===0?0:generated.indexOf(`<!-- minerujson:page:v1:${page}\n`);
    if(first<0||auditStart<0||first<=auditStart)fail('generator page prefix missing: '+page);
    const prefix=generated.slice(auditStart,first);
    if(output.indexOf(anchor)<0||output.indexOf(anchor)!==output.lastIndexOf(anchor))fail('missing or duplicated original page anchor: '+page);
    parts.push({anchor,prefix,page});
    for(const [block] of info.para_blocks.entries()){
      const id=`<!-- minerujson:block:v1:${page}:${block} -->`;
      if(old.indexOf(id)<0||old.indexOf(id)!==old.lastIndexOf(id))fail('missing or duplicated original block anchor: '+id);
      anchorCount++;
    }
  }
  if((old.match(/<!-- minerujson:block:v1:/g)||[]).length!==anchorCount)fail('unknown extra block anchors');
  // Replace pages from last to first so existing content, edits and positions
  // inside every block are unchanged. Every prefix is removed in roundtrip.
  for(const {anchor,prefix} of [...parts].reverse()) output=output.replace(anchor,prefix+anchor);
  let restored=output;
  for(const {anchor,prefix} of parts){
    if(!restored.includes(prefix+anchor))fail('migration proof failed');
    restored=restored.replace(prefix+anchor,anchor);
  }
  if(restored!==old)fail('old mother document would change other than inserted evidence comments');
  return {output,pages:data.pdf_info.length,paragraphs:anchorCount,
    discarded:data.pdf_info.reduce((n,p)=>n+(p.discarded_blocks||[]).length,0),
    preprocDifferences:data.pdf_info.reduce((n,p)=>n+(p.preproc_blocks||[])
      .filter((b,i)=>JSON.stringify(b)!==JSON.stringify(p.para_blocks[i])).length,0),
    originalSourceHash:hash(original)};
}
function main(){
  const args=process.argv.slice(2),get=flag=>{const i=args.indexOf(flag);return i===-1?null:args[i+1];};
  const input=get('--document');if(!input)fail('pass --document <path>');
  const file=resolve(input);
  const oldBytes=readFileSync(file);
  const old=oldBytes.toString('utf8');
  if(!Buffer.from(old,'utf8').equals(oldBytes))fail('document has invalid UTF-8');
  const beforeSha=hash(oldBytes);
  const {output,...counts}=migrate(old);
  const outputBytes=Buffer.from(output,'utf8');
  const result={beforeSha,afterSha:hash(outputBytes),addedBytes:outputBytes.length-oldBytes.length,...counts};
  const dst=get('--output'),apply=args.includes('--apply');
  if(dst&&apply)fail('--output and --apply are mutually exclusive');
  if(apply){
    const expected=get('--expected-sha');
    if(!expected||expected!==beforeSha)fail('explicit --expected-sha does not match current document');
    const dir=dirname(file), backups=join(dir,'.lossless-audit-backups');
    mkdirSync(backups,{recursive:true,mode:0o700});
    const nonce=randomBytes(5).toString('hex');
    const backup=join(backups,basename(file)+'.'+new Date().toISOString().replace(/[-:.]/g,'')+'.'+nonce+'.bak');
    const fd=openSync(backup,'wx',0o600);
    try{writeFileSync(fd,oldBytes);fsyncSync(fd);}finally{closeSync(fd);}
    const tmp=join(dir,'.audit-'+nonce+'.tmp');
    try{
      const out=openSync(tmp,'wx',statSync(file).mode&0o777);
      try{writeFileSync(out,outputBytes);fsyncSync(out);}finally{closeSync(out);}
      if(hash(readFileSync(file))!==beforeSha)fail('concurrent edit detected: backup retained; active document untouched');
      renameSync(tmp,file);
    }finally{try{unlinkSync(tmp);}catch{}}
    if(hash(readFileSync(file))!==result.afterSha)fail('published file hash mismatch; inspect backup');
    result.backup=backup;
    console.log('V6_ANNOTATION_APPLIED',JSON.stringify(result));
  }else if(dst){
    const dest=resolve(dst);if(dest===file)fail('output must differ from original');
    writeFileSync(dest,outputBytes,{flag:'wx',mode:0o600});
    result.previewPath=dest;
    console.log('V6_ANNOTATION_STAGED',JSON.stringify(result));
  }else console.log('V6_ANNOTATION_DRY_RUN',JSON.stringify(result));
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
