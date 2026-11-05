/** Regression from user's actual Buffett's Alpha p6b6 parent/child structure.
 * Build a disposable copy from the public fixture, reparenting physical p6b7
 * into the logical parent's body child without altering sealed OCR JSON. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import nspell from 'nspell';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDReparentPBS} from '../ui/cmd-block-chains.js';
import {detectIllegalBreaks,planIllegalBreakMarks} from '../ui/cmd-linebreak.js';
const spell=nspell(readFileSync('node_modules/dictionary-en/index.aff'),
  readFileSync('node_modules/dictionary-en/index.dic'));
const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const plan=planCMDReparentPBS(original,'p6b7','p6b6');
const source=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected);return s.slice(0,e.from)+e.insert+s.slice(e.to);
},original);
const atoms=readCMDBlockChains(source).atoms;
assert.deepEqual(atoms.filter(x=>x.id.startsWith('p6b6')).map(x=>[x.id,x.origin,x.role]),
  [['p6b6','p6b6',null],['p6b6s0','p6b6','body'],['p6b6s1','p6b7',null]]);
const bodyEnd=source.indexOf('<!-- minerujson:source:v1:');
const scan=detectIllegalBreaks(source,spell,{bodyEnd});
const matches=scan.issues.filter(x=>x.parentId==='p6b6');
assert.deepEqual(matches.map(x=>[x.blockId,x.nextBlockId||null,x.joined,x.reviewOnly]),[
  ['p6b6s0','p6b6s1','about 3',true],
  ['p6b6s1',null,'leverage',true],
  ['p6b6s1',null,'insurance',true],
]);
assert.deepEqual(matches.map(x=>x.reason),[
  '同父子块交界疑似句子续接',
  '子块内 OCR 连字符空格疑似断词',
  '子块内 OCR 连字符空格疑似断词',
]);
assert.equal(new Set(matches.map(x=>x.from)).size,3,'two same-line scars must have distinct AG row IDs');
assert.equal(source.slice(matches[1].from,matches[1].to),'- ');
assert.equal(source.slice(matches[2].from,matches[2].to),'- ');
assert.equal(planIllegalBreakMarks(source,matches,[]).length,0,
  'review-only boundary and inline scars must never write newline CMD tags');
// Same body semantic role, but a table/HTML boundary does not permit a seam.
const table=source.replace('only 1.72%, about','only 1.72%.');
assert(!detectIllegalBreaks(table,spell,{bodyEnd:table.indexOf('<!-- minerujson:source:v1:')})
  .issues.some(x=>x.parentId==='p6b6'&&x.nextBlockId==='p6b6s1'));
const fenced=source.replace('term lever- age','term `lever- age`');
assert(!detectIllegalBreaks(fenced,spell,{bodyEnd:fenced.indexOf('<!-- minerujson:source:v1:')})
  .issues.some(x=>x.parentId==='p6b6'&&x.joined==='leverage'));
const joined=source.replace('term lever- age','term leverage');
assert(!detectIllegalBreaks(joined,spell,{bodyEnd:joined.indexOf('<!-- minerujson:source:v1:')})
  .issues.some(x=>x.parentId==='p6b6'&&x.joined==='leverage'));
assert.equal(source.slice(bodyEnd),original.slice(original.indexOf('<!-- minerujson:source:v1:')),
  'sealed MinerU evidence unchanged by reparenting and scan');
console.log('CMD_P6B6_ILLEGAL_BREAK_PASS about/3, leverage, insurance, no auto-edit, sealed OCR intact');
