import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceBlocks,sourceSubblocks} from '../ui/pdf-source-locations.js';
import {planCMDSubblockAnnotations} from '../ui/cmd-text-blocks.js';
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const plan=await planCMDSubblockAnnotations(original);
const marked=[...plan.edits].sort((a,b)=>b.from-a.from)
  .reduce((src,e)=>src.slice(0,e.from)+e.insert+src.slice(e.to),original);
const lines=marked.split('\n');
const roots=sourceBlocks(marked),children=sourceSubblocks(marked);
const root=(p,b)=>roots.find(r=>r.pageIndex===p&&r.blockIndex===b);
const child=(p,b,i)=>children.find(r=>r.pageIndex===p&&r.blockIndex===b&&r.path.join('.')===String(i));
assert(roots.length===224);
assert(children.length===43);
for(const [p,b,i,expected] of [[3,0,0,'Table 1.'],[3,0,1,'<table>'],
  [3,1,0,'<table>'],[3,1,1,'Notes:'],[4,1,0,'Figure 1.'],
  [4,1,1,'![chart]'],[4,1,2,'Notes:']]){
  const item=child(p,b,i);
  assert(item?.contentLine,`real p${p}b${b}s${i} needs a real Markdown text line`);
  assert(lines[item.contentLine-1].includes(expected),
    `p${p}b${b}s${i} content must match the specific child type (${expected})`);
  assert.notEqual(item.contentLine,item.sourceLine,'tag and body are distinct locations');
  assert(item.contentEndLine>=item.contentLine,'source child content range must be bounded');
}
for(const i of [0,1,2]){
  const item=child(4,0,i);
  assert(item?.sourceLine&&item.contentLine===null,
    'p4b0 OCR metadata-only child MUST NOT pretend to have source text');
  assert(lines[item.sourceLine-1].includes(`id="p4b0s${i}"`));
}
assert.equal(root(4,0).contentLine,null,'p4b0 parent only has structure');
assert.equal(root(4,0).contentEndLine,null,'metadata-only parent has no source body range');
assert(lines[root(3,0).contentLine-1].includes('Table 1.'));
// After the user explicitly inserts text, only that child gets a real source
// target; siblings must remain structural-only with the SAME native PDF IDs.
const s2=child(4,0,2);
const withEditedText=lines.slice(0,s2.sourceLine).join('\n')+'\n'+
  'Notes: Manually reviewed source text\n'+lines.slice(s2.sourceLine).join('\n');
const updated=sourceSubblocks(withEditedText);
const after=updated.find(x=>x.pageIndex===4&&x.blockIndex===0&&x.path[0]===2);
assert.equal(after.contentLine,after.sourceLine+1);
assert.equal(after.contentEndLine,after.contentLine);
assert.equal(updated.find(x=>x.pageIndex===4&&x.blockIndex===0&&x.path[0]===1).contentLine,null);
console.log('PDF_SOURCE_CONTENT_MAPPING_PASS',{rootBlocks:roots.length,childBlocks:children.length,
  structuralOnly:['p4b0s0','p4b0s1','p4b0s2'],sample:child(3,0,0)});
