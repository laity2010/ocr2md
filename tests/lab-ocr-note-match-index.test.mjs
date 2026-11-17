import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectNoteMatchIndex,validateNoteMatchConfig,DEFAULT_NOTE_MATCH_CONFIG,
  NOTE_BODY_RULES,NOTE_REFERENCE_RULES} from '../ui/lab-ocr/note-match-index.js';
const rows=(lines)=>lines.map((line,i)=>({line_no:i+1,line_id:`line-${i+1}`,
  block_id:100+i,text:line}));
const blocks=(lines)=>lines.map((line,i)=>({block_id:100+i,
  pbs:`p1b${i}`,global_page:0,block_type:'text',block_group:'para_blocks'}));
const scan=(lines,config)=>projectNoteMatchIndex(rows(lines),blocks(lines),config);
const base=[
  '# Chapter A',
  'A strong citation<sup>1</sup>; a second citation \\<sup>1\\</sup>.',
  'Another superscript² and a Markdown [^3] marker.',
  'Maybe [4] or (5), or Word†, depending on the book.',
  'M<sup>uch</sup> <sup>has</sup> <sup>been</sup> said; not footnotes.',
  'Math $x^2 + (5)$ and `code [4]` and [2](https://example.com) do not count.',
  '## Notes',
  '1. First note paragraph',
  '2) Second note',
  '[^3]: Third body',
  '[4] Fourth body',
  '5. Fifth body',
  '† Symbol footnote content',
];
const result=scan(base);
assert.deepEqual(result.configuration.referenceRules,DEFAULT_NOTE_MATCH_CONFIG.referenceRules);
assert.deepEqual(result.configuration.bodyRules,DEFAULT_NOTE_MATCH_CONFIG.bodyRules);
assert.equal(result.stats.references,7,JSON.stringify(result.references.map(x=>[x.raw,x.line_no])));
assert.equal(result.stats.bodies,6,JSON.stringify(result.bodies.map(x=>[x.raw,x.line_no])));
assert.equal(result.stats.matched,4,'html sup x2, superscript and md refs are strong');
assert.equal(result.stats.need_review,3,'[4], (5), and Word† are ambiguous by default');
assert.equal(result.stats.orphan_bodies,0);
assert.equal(result.pairs.filter(x=>x.number==='1').length,2,'one body can serve multiple references');
assert.equal(new Set(result.pairs.filter(x=>x.number==='1').map(x=>x.body_id)).size,1);
assert(result.references.every(r=>r.line_id&&Number.isInteger(r.block_id)&&
  r.pbs&&r.from>=0&&r.to>r.from&&r.context.includes(r.raw)&&
  r.evidence.rule_id&&r.evidence.scope));
assert(result.bodies.every(b=>b.body_line_ids.includes(b.line_id)&&b.body_block_ids.includes(b.block_id)));
assert.equal(result.bodies.find(x=>x.number==='1').evidence.notes_section,true);
assert(result.references.every(x=>!x.context.includes('uch</sup>')));
assert(Object.isFrozen(result)&&Object.isFrozen(result.stats));

const weaker=scan(base,{weakAutoMatch:true});
assert.equal(weaker.stats.matched,7);
const strict=scan(base,{referenceRules:['ref.html-sup'],bodyRules:['body.number-dot']});
assert.equal(strict.stats.references,2);
assert.equal(strict.stats.bodies,2);
assert.equal(strict.stats.missing_body,0);

const conflict=scan(['Text<sup>1</sup>','## Notes','1. First','1. Duplicate']);
assert.equal(conflict.stats.conflict,1);
assert.equal(conflict.pairs[0].body_id,null);
assert.equal(conflict.pairs[0].candidate_body_ids.length,2);
const noBody=scan(['Text<sup>3</sup>']);
assert.equal(noBody.pairs[0].status,'缺注文');
const orphan=scan(['## Notes','1. Body only']);
assert.equal(orphan.stats.orphan_bodies,1);

const scopeLines=['# One','Alpha<sup>1</sup>','## Notes','1. Note One',
  '# Two','Beta<sup>1</sup>','## Notes','1. Note Two'];
const global=scan(scopeLines);
assert.equal(global.stats.conflict,2,'Book-level same numbers are ambiguous');
const local=scan(scopeLines,{scope:'chapter',chapterLevel:1});
assert.equal(local.stats.matched,2,'Chapter scope disambiguates same number');
assert.equal(local.pairs[0].body_id,local.bodies[0].candidate_id);
assert.equal(local.pairs[1].body_id,local.bodies[1].candidate_id);
const alpha=scan(['Mention<sup>a</sup> and OCR M<sup>uch</sup>.',
  '## Notes','a. A letter-labelled footnote.'],{
  referenceRules:['ref.html-alpha'],bodyRules:['body.letter-dot'],
  weakAutoMatch:false});
assert.equal(alpha.stats.references,1,'Opt-in alphabetic mode never matches OCR <sup>uch</sup>');
assert.equal(alpha.stats.bodies,1);
assert.equal(alpha.pairs[0].status,'待核实','Alphabetic evidence remains tentative');
const bookSpecific=scan(['Source section §1 and another §1','## Notes','§1：Local note body'],{
  referenceRules:[],bodyRules:[],
  customRules:[
    {id:'book.ref.section',kind:'reference',pattern:'§(?<id>[0-9]{1,3})',strength:'strong'},
    {id:'book.body.section',kind:'body',pattern:'^§(?<id>[0-9]{1,3})[：:]\\s*(?<content>.+)$',strength:'strong'},
  ],
});
assert.equal(bookSpecific.stats.references,2);
assert.equal(bookSpecific.stats.bodies,1);
assert.equal(bookSpecific.stats.matched,2);
assert.equal(bookSpecific.pairs[0].body_id,bookSpecific.pairs[1].body_id);
assert.deepEqual(bookSpecific.references.map(x=>x.evidence.rule_id),
  ['book.ref.section','book.ref.section']);
assert.equal(scan(['Mention<sup>a</sup>','## Notes','a. Footnote body']).stats.references,0,
  'Alpha rule is not a universal default');

const sections=scan(['Text<sup>1</sup>','## Notes','1. Body first paragraph','',
  'More body in a separate block','## Appendix','Not part of the note'],
  {continuation:'notes-section'});
assert(sections.bodies[0].content.includes('More body in a separate block'));
assert(!sections.bodies[0].content.includes('Not part of the note'));
assert.equal(sections.bodies[0].body_line_ids.length,3);
const sameBlock=projectNoteMatchIndex([
  {line_no:1,line_id:'ref',block_id:1,text:'Text<sup>1</sup>'},
  {line_no:2,line_id:'note',block_id:2,text:'1. First paragraph'},
  {line_no:3,line_id:'body-cont',block_id:2,text:'Second paragraph'},
  {line_no:4,line_id:'spacer',block_id:2,text:''},
  {line_no:5,line_id:'other',block_id:3,text:'New prose'}]);
assert.deepEqual(sameBlock.bodies[0].body_line_ids,['note','body-cont','spacer']);

const masked=scan(['Source<sup>1</sup> and `inline<sup>2</sup>`',
  '```','Ignored<sup>2</sup>','```','$$',
  'r_t<sup>3</sup>','$$','<table><tr><td>1. Not a note</td></tr></table>',
  '## Notes','1. Real body']);
assert.equal(masked.stats.references,1);
assert.equal(masked.stats.bodies,1);
assert.equal(masked.pairs[0].status,'已匹配');
const badBlock=projectNoteMatchIndex(rows(['Text<sup>1</sup>','1. Not a body']),[
  {block_id:100,pbs:'p1b0',block_type:'text',block_group:'para_blocks'},
  {block_id:101,pbs:'p1b1',block_type:'table',block_group:'tables'}]);
assert.equal(badBlock.stats.bodies,0);

for(const opts of [{referenceRules:['not-installed']},{bodyRules:['body.md-footnote','body.md-footnote']},
  {scope:'page'},{chapterLevel:8},{continuation:'unbounded'},{weakAutoMatch:'yes'},
  {customRules:[{id:'bad',kind:'reference',pattern:'foo',strength:'strong'}]},
  {customRules:[{id:'book.body.bad',kind:'body',pattern:'foo(?<id>\\d+)',strength:'strong'}]}])
  assert.throws(()=>validateNoteMatchConfig(opts));
assert.throws(()=>projectNoteMatchIndex([
  {line_no:1,line_id:'x',text:'abc'},
  {line_no:2,line_id:'x',text:'duplicate'}]),/MD 行来源无效/);

// Same benchmark as Main, but with NEW tag-free CM6 LineID/BlockID evidence.
// Do not copy Main's CMD markers or rely on its source offsets.
const book=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const bookLines=book.split('\n');
const bookRows=rows(bookLines),bookBlocks=blocks(bookLines);
const actual=projectNoteMatchIndex(bookRows,bookBlocks);
const matchedNumbers=[...new Set(actual.pairs.filter(x=>x.status==='已匹配').map(x=>x.number))]
  .sort((a,b)=>Number(a)-Number(b));
assert.deepEqual(matchedNumbers,Array.from({length:10},(_,i)=>String(i+1)),
  JSON.stringify({stats:actual.stats,refs:actual.references.slice(0,12)}));
assert.equal(actual.stats.bodies,10,'Main Buffett fixture has ten unique note bodies');
assert(actual.references.every(ref=>ref.number!=='uch'&&ref.number!=='Bufet'));
assert.equal(actual.stats.conflict,0);
assert.equal(actual.stats.missing_body,0);
console.log('LAB_OCR_NOTE_MATCH_WP1_DIRECT_PASS',JSON.stringify({
  benchmark:actual.stats,mixed:result.stats,chapter:local.stats,
  tested:'mixed styles, OCR fake sup, table/math/code, citations, duplicates, scopes, multiline, configurable rules'}));
