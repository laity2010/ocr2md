import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {split,rebuild} from '../ui/sentence-benchmark-core.js';
import {reviewInventory} from '../ui/sentence-benchmark-review.js';
import {buildTranslationTable,TRANSLATION_TABLE_SCHEMA}
  from '../ui/sentence-benchmark-translation-table.js';

const engines=['intl','sentence-splitter','wink-nlp'];
function prepare(md){
  const runs=new Map(engines.map(engine=>{
    const value=split(md,engine);
    assert.equal(rebuild(value),md);
    return [engine,{value,lossless:true}];
  }));
  return reviewInventory(md,runs);
}
const sha=md=>createHash('sha256').update(md,'utf8').digest('hex');
test('a single table covers every text PBS block with either sentences or one valid whole-block row',()=>{
  const md=readFileSync('labs/sentence-benchmark/.runtime/document.md','utf8');
  const sidecar=JSON.parse(readFileSync(
    'labs/sentence-benchmark/.runtime/document.sentences.review.json','utf8'));
  assert.equal(sidecar.sourceSha256,sha(md));
  const inventory=prepare(md);
  const table=buildTranslationTable(md,sidecar,inventory);
  assert.equal(table.schema,TRANSLATION_TABLE_SCHEMA);
  assert.equal(table.sourceSha256,sha(md));
  const reviewedSeams=[...md.matchAll(/<!-- cmd:block:v1 id="([^"\n]+)" lb="m" -->/g)]
    .map(m=>m[1]);
  const joined=table.rows.filter(row=>row.blockIds?.length>1);
  const legacy=JSON.parse(readFileSync(
    'labs/sentence-benchmark/.runtime/translation-review/input/translation-units.json','utf8'));
  assert.equal(reviewedSeams.length,8);
  assert.equal(joined.length,8,'all eight human-reviewed CMD seams must become full AI units');
  assert.equal(table.rows.length,legacy.rows.length-reviewedSeams.length);
  for(const id of reviewedSeams){
    const row=joined.find(row=>row.blockIds.at(-1)===id);
    assert(row,'missing reviewed merge for '+id);
    assert(row.sourceRanges.length>=2,'joined source must retain original disjoint UTF-16 ranges');
    assert(row.sourceRanges.every(range=>!md.slice(range.from,range.to).includes('<!-- cmd:block:')));
  }
  const about=joined.find(row=>row.blockIds.at(-1)==='p6b6s1');
  assert.equal(about.id,'p6b6s0-s003');
  assert.equal(about.original,'Table 3 shows that the estimated average annual cost of Berkshire’s insurance float is only 1.72%, about 3 percentage points below the average T-bill rate.');
  assert(!table.rows.some(row=>row.original==='3 percentage points below the average T-bill rate.'),
    'an approved OCR continuation must never reach AI as a dangling sentence');
  const footnote=joined.find(row=>row.blockIds.at(-1)==='p16b9s1');
  assert.equal(footnote.type,'text_block',
    'a whole-block predecessor must not invent new sentence boundaries');
  assert.deepEqual(Object.keys(table).sort(),[
    'coordinate','rows','schema','sourceSha256']);
  assert(new Set(table.rows.map(x=>x.blockId)).size>=inventory.size);
  for(const id of inventory.keys())assert(table.rows.some(row=>
    (row.blockIds||[row.blockId]).includes(id)),
    'each PBS atom must still be represented, including reviewed joined units: '+id);
  assert.equal(new Set(table.rows.map(x=>x.id)).size,table.rows.length);
  const whole=table.rows.filter(row=>row.type==='text_block');
  const expectedWhole=[...inventory.keys()].filter(id=>
    !['auto','arbitrated'].includes(sidecar.blocks[id]?.status));
  for(const id of expectedWhole)
    assert(whole.some(row=>row.blockId===id),
      'unadopted and unsegmented blocks must be single valid AI rows: '+id);
  assert(whole.length>=expectedWhole.length);
  assert.equal(whole.length,expectedWhole.length+
    whole.filter(row=>!inventory.has(row.blockId)).length);
  // Text excluded from segmentation is not necessarily excluded from
  // translation: headings, note-body prose and hard-break prose must remain.
  assert(whole.some(row=>row.elementType==='heading'&&row.original==='References'));
  assert(whole.some(row=>row.elementType==='note_body'&&
    row.original.startsWith('Based on the original insights of Black')));
  assert(!whole.some(row=>row.original.includes('<!--ocr2md:')));
  assert(!table.rows.some(row=>row.original.includes('<table')));
  assert(!table.rows.some(row=>row.original.startsWith('![image]')));
  assert(table.rows.filter(x=>x.type==='sentence').length>100);
  for(const row of table.rows){
    assert(inventory.has(row.blockId)||row.elementType==='heading'||
      row.elementType==='note_body'||row.elementType==='paragraph');
    assert(['sentence','text_block'].includes(row.type));
    assert.equal(row.corrected,null);
    assert.equal(row.translation,null);
    assert(row.original.length>0);
    assert(!row.original.startsWith('>>'));
    assert(Array.isArray(row.sourceRanges)&&row.sourceRanges.length>0);
    assert.equal(row.from,row.sourceRanges[0].from);
    assert.equal(row.to,row.sourceRanges.at(-1).to);
    assert(row.sourceRanges.every(f=>Number.isInteger(f.from)&&
      Number.isInteger(f.to)&&f.from<f.to&&f.to<=md.length));
    assert(row.sourceRanges.every(f=>!md.slice(f.from,f.to).includes('<!-- cmd:block:v1')));
  }
  for(const id of ['p4b0s2','p7b0s2','p8b0s2','p10b0s2','p14b0s2']){
    assert(table.rows.some(r=>r.blockId===id&&r.original.includes('Notes:')),
      'table note body is translatable: '+id);
  }
});
test('unadopted disagreement remains one AI-ready whole text block, never a missing/pending row',()=>{
  const md=[
    '<!-- cmd:block:v1 id="p0b0" -->',
    'First full sentence. Second full sentence.',
    '<!-- cmd:block:v1 id="p0b1" -->',
    'Dr. Smith arrived. He left. Finished.',
    '<!-- cmd:block:v1 id="p0b2" -->',
    'This line contains $x+y$ formula. More prose follows.',
    '<!-- cmd:block:v1 id="p0b3" -->',
    '>>Notes: Hello from a table note. Another part.',
    '<!-- cmd:block:v1 id="p0b4" -->',
    'This is prose with a Markdown hard break.  ',
    '<!-- cmd:block:v1 id="p0b5" -->',
    '## A Heading To Translate',
    '<!-- cmd:block:v1 id="p0b6" -->',
    '<!--ocr2md:note-body id="1"-->',
    '[^1]: This is a footnote to translate.',
    '<!-- cmd:block:v1 id="p0b7" -->',
    '![image](media/pic.png)',
    '<!-- cmd:block:v1 id="p0b8" -->',
    '<table><tr><td>Never translate this structural table cell.</td></tr></table>'
  ].join('\n');
  const inventory=prepare(md);
  const b0=inventory.get('p0b0'),b1=inventory.get('p0b1');
  assert(b0?.agreed&&b1?.disagreed);
  const review={sourceSha256:sha(md),blocks:{
    p0b0:{status:'auto',boundaries:b0.boundaries},
    p0b2:{status:'arbitrated',engine:'intl',
      boundaries:inventory.get('p0b2').engines[0].boundaries}
  },manualGold:{}};
  const rows=buildTranslationTable(md,review,inventory).rows;
  const disputed=rows.filter(r=>r.blockId==='p0b1');
  assert.equal(disputed.length,1);
  assert.equal(disputed[0].type,'text_block');
  assert.equal(disputed[0].decision,'whole_block');
  assert.equal(disputed[0].original,'Dr. Smith arrived. He left. Finished.');
  const formula=rows.filter(r=>r.blockId==='p0b2');
  assert(formula.length>0&&formula.every(r=>!r.original.includes('$x+y$')));
  const note=rows.filter(r=>r.blockId==='p0b3');
  assert.equal(note.length,1);
  assert.equal(note[0].type,'text_block');
  assert(note[0].original.startsWith('Notes: Hello'));
  assert(!rows.some(r=>r.original.includes('<!-- cmd:')));
  for(const [blockId,elementType,prefix] of [
    ['p0b4','paragraph','This is prose'],
    ['p0b5','heading','A Heading To Translate'],
    ['p0b6','note_body','This is a footnote']]){
    const item=rows.filter(r=>r.blockId===blockId);
    assert.equal(item.length,1);
    assert.equal(item[0].type,'text_block');
    assert.equal(item[0].elementType,elementType);
    assert(item[0].original.startsWith(prefix));
  }
  assert(!rows.some(r=>r.blockId==='p0b7'||r.blockId==='p0b8'),
    'Media and structural HTML should never be sent to AI');
});
test('only lb=m joins adjacent PBS blocks; pending and ignored seams remain separate',()=>{
  for(const marker of [' lb="m"',' lb="i"','']){
    const md=['<!-- cmd:block:v1 id="p1b1s0" -->',
      'The rate was about',
      '<!-- cmd:block:v1 id="p1b1s1"'+marker+' -->',
      '3 points below the benchmark. Another sentence.'].join('\n\n');
    const inv=prepare(md),review={sourceSha256:sha(md),blocks:{},manualGold:{}};
    const rows=buildTranslationTable(md,review,inv).rows;
    const joined=rows.filter(row=>row.blockIds?.length>1);
    assert.equal(joined.length,marker===' lb="m"'?1:0,marker||'pending');
    if(joined.length){
      assert.equal(joined[0].original,'The rate was about 3 points below the benchmark. Another sentence.');
      assert.equal(joined[0].type,'text_block');
      assert.deepEqual(joined[0].blockIds,['p1b1s0','p1b1s1']);
    }else{
      assert.equal(rows.length,2);
      assert.equal(rows[0].original,'The rate was about');
    }
  }
});

test('explicit manual Gold overrides chosen sentence boundaries without losing text',()=>{
  const md=['<!-- cmd:block:v1 id="p0b0" -->',
    'One statement. Another statement. More content.'].join('\n');
  const inv=prepare(md),b=inv.get('p0b0');
  assert(b?.agreed&&b.boundaries.length>=2);
  const review={sourceSha256:sha(md),blocks:{p0b0:{
    status:'auto',boundaries:b.boundaries}},manualGold:{}};
  const original=buildTranslationTable(md,review,inv).rows;
  review.manualGold[String(b.boundaries[0])]={break:false,manual:true};
  const changed=buildTranslationTable(md,review,inv).rows;
  assert.equal(changed.length,original.length-1);
  assert.equal(changed.map(r=>r.original).join('').replace(/\s+/gu,''),
    original.map(r=>r.original).join('').replace(/\s+/gu,''));
});
