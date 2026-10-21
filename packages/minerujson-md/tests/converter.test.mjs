import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import {toMarkdown,toMineruJSON,version} from '../dist/index.js';

const fixture = resolve(dirname(fileURLToPath(import.meta.url)),'../fixtures');
const raw = readFileSync(resolve(fixture,'buffetts-alpha.mineru.json'),'utf8');
const saved = readFileSync(resolve(fixture,'buffetts-alpha.minerujson.md'),'utf8');
const original = JSON.parse(raw);
const parse = unified().use(remarkParse).use(remarkGfm);

test('only three public APIs, version',async()=>{
  const exported = await import('../dist/index.js');
  assert.deepEqual(Object.keys(exported).sort(),['toMarkdown','toMineruJSON','version']);
  assert.equal(version(),'0.1.0');
});

test('real Buffett Alpha fixture: no loss of even JSON whitespace',()=>{
  assert.equal(original.pdf_info.length,22);
  const audited=toMarkdown(raw);
  assert(audited.startsWith('<!-- minerujson:audit:v1:complete -->'));
  assert.equal(toMineruJSON(audited),raw);
  assert.equal(toMineruJSON(saved),raw);
  assert(!saved.includes('minerujson:end:'),'fixture follows single-start boundary');
  assert(!audited.includes('minerujson:end:'),'new converter emits no end markers');
  const count = original.pdf_info.reduce((sum,p)=>sum+p.para_blocks.length,0);
  assert.equal(saved.match(/<!-- minerujson:block:v1:/g)?.length,count);
  assert.equal(count,224);
  assert.equal(audited.match(/<!-- minerujson:block:v1:/g)?.length,count);
  assert.equal(audited.match(/<!-- minerujson:page:v1:/g)?.length,22);
  assert.equal(audited.match(/<!-- minerujson:discarded:v1:/g)?.length,91);
  assert.equal(audited.match(/<!-- minerujson:preproc-diff:v1:/g)?.length,18);
  assert(audited.includes('Volume 74 Number 4'));
  assert(audited.includes('We thank Clif Asness'));
  assert(audited.includes('Financial Analysts Journal'));
  assert.equal(toMineruJSON(saved),raw,'single-start unaudited fixture must roundtrip');
});

test('valid GFM / HTML comments / images / math code / tables',()=>{
  const tree=parse.parse(toMarkdown(raw));
  assert.equal(tree.type,'root');
  const types = new Set(tree.children.map(node=>node.type));
  assert(types.has('heading'));
  assert(types.has('paragraph'));
  assert(types.has('html'));
  assert(types.has('code'));
  assert(saved.includes('!['));
  assert(saved.includes('<table>'));
  assert(saved.includes('```math'));
});

test('original source metadata is preserved after a single-span heading edit',()=>{
  const changed = saved.replace('Bufett’s Alpha','Buffett’s Alpha');
  assert.notEqual(changed,saved);
  const restored=JSON.parse(toMineruJSON(changed));
  assert.equal(restored.pdf_info[0].para_blocks[0].lines[0].spans[0].content,'Buffett’s Alpha');
  assert.deepEqual(restored.pdf_info[0].preproc_blocks,original.pdf_info[0].preproc_blocks);
  assert.deepEqual(restored.pdf_info[0].discarded_blocks,original.pdf_info[0].discarded_blocks);
});

test('heading level edits restore original MinerU level field',()=>{
  const changed=saved.replace('## Bufett’s Alpha','### Bufett’s Alpha');
  assert.notEqual(changed,saved);
  assert.equal(JSON.parse(toMineruJSON(changed)).pdf_info[0].para_blocks[0].level,3);
});

test('multi-span paragraph edit inside one span preserves remaining OCR spans',()=>{
  const changed=saved.replace('To cite this article:','Please cite this article:');
  assert.notEqual(changed,saved);
  const restored=JSON.parse(toMineruJSON(changed));
  const spans=restored.pdf_info[0].para_blocks[2].lines.flatMap(line=>line.spans);
  const old=original.pdf_info[0].para_blocks[2].lines.flatMap(line=>line.spans);
  assert(spans[0].content.startsWith('Please cite this article:'));
  assert.deepEqual(spans.slice(1),old.slice(1));
});

test('image URL edit changes its matching MinerU span',()=>{
  const regex=/(!\[image\]\()(https:[^)]+)(\))/;
  const match=regex.exec(saved);assert(match);
  const changed=saved.replace(regex,(_,before,url,after)=>before+url+'?v6=1'+after);
  const restored=JSON.parse(toMineruJSON(changed));
  const originalPath=original.pdf_info[0].para_blocks[5].blocks[0].lines[0].spans[0].image_path;
  assert.equal(restored.pdf_info[0].para_blocks[5].blocks[0].lines[0].spans[0].image_path,originalPath+'?v6=1');
});

test('HTML table edit changes only its HTML representation',()=>{
  assert(saved.includes('Stock/Fund Measure'));
  const changed=saved.replace('Stock/Fund Measure','Stock/Fund Metric');
  const restored=JSON.parse(toMineruJSON(changed));
  const table=restored.pdf_info[3].para_blocks[0];
  const html=table.blocks.find(x=>x.type==='table_body').lines[0].spans[0].html;
  assert(html.includes('Stock/Fund Metric'));
  assert.equal(table.bbox[0],original.pdf_info[3].para_blocks[0].bbox[0]);
});

test('math code edit updates the original equation span',()=>{
  const changed=saved.replace('L _ {t} =','L_{t} =');
  assert.notEqual(changed,saved);
  const restored=JSON.parse(toMineruJSON(changed));
  const eq=restored.pdf_info[5].para_blocks[5];
  assert.equal(eq.type,'interline_equation');
  assert(eq.lines[0].spans[0].content.startsWith('L_{t} ='));
});

test('missing anchors, metadata corruption and added free text are rejected',()=>{
  assert.throws(()=>toMineruJSON(saved.replace('<!-- minerujson:block:v1:0:0 -->','')),/INVALID/);
  assert.throws(()=>toMineruJSON(saved.replace(/(<!-- minerujson:source:v1:)[a-f0-9]/,'$1f')),/INVALID/);
  assert.throws(()=>toMineruJSON('# untracked\n\n'+saved),/INVALID/);
});

test('audited comments remain part of valid Markdown and are tamper-evident',()=>{
  const md=toMarkdown(raw);
  const mdast=parse.parse(md);
  assert(mdast.children.filter(x=>x.type==='html').length>=100);
  const marker='<!-- minerujson:discarded:v1:2:0';
  assert(md.includes(marker));
  assert.throws(()=>toMineruJSON(md.replace(marker,'<!-- minerujson:discarded:v1:2:8')),/INVALID/);
  assert.throws(()=>toMineruJSON(md.replace('Volume 74 Number 4','Volume 74 Number 5')),/INVALID/);
  assert.throws(()=>toMineruJSON(md.replace('minerujson:audit:v1:complete','minerujson:audit:v1:partial')),/INVALID/);
  assert.throws(()=>toMineruJSON(md+'injected'),/INVALID/);
});

test('audited conversion preserves editable OCR spans without touching discarded metadata',()=>{
  const md=toMarkdown(raw);
  const changed=md.replace('## Bufett’s Alpha','### Buffett’s Alpha');
  const restored=JSON.parse(toMineruJSON(changed));
  assert.equal(restored.pdf_info[0].para_blocks[0].level,3);
  assert.equal(restored.pdf_info[0].para_blocks[0].lines[0].spans[0].content,'Buffett’s Alpha');
  assert.deepEqual(restored.pdf_info[0].discarded_blocks,original.pdf_info[0].discarded_blocks);
  assert.deepEqual(restored.pdf_info[2].preproc_blocks,original.pdf_info[2].preproc_blocks);
});

test('source strings that look like HTML cannot break an evidence comment',()=>{
  const data=structuredClone(original);
  data.pdf_info[0].discarded_blocks[0].lines[0].spans[0].content='weird --> <script>unsafe</script> -- --!>';
  const audited=toMarkdown(data);
  assert(audited.includes('\\u003cscript\\u003e'));
  assert(!audited.includes('weird --> <script>'));
  assert.equal(JSON.parse(toMineruJSON(audited)).pdf_info[0].discarded_blocks[0]
    .lines[0].spans[0].content,'weird --> <script>unsafe</script> -- --!>');
});

test('unknown/unrepresentable blocks are commented instead of fabricated markdown',()=>{
  const data={pdf_info:[{page_idx:0,page_size:[200,300],preproc_blocks:[],discarded_blocks:[],
    para_blocks:[{type:'vector_shape',bbox:[0,0,4,5],customData:'vector',lines:[]}]}]};
  const md=toMarkdown(data);
  assert(md.includes('minerujson:unmapped:v1:0:0'));
  assert(!md.includes('[MinerU vector_shape:'));
  assert.deepEqual(JSON.parse(toMineruJSON(md)),data);
});

test('input can also be parsed JSON object; corrupted JSON rejected',()=>{
  const md=toMarkdown({pdf_info:[{page_idx:0,para_blocks:[{type:'title',level:1,lines:[{spans:[{type:'text',content:'Hello'}]}]}]}]});
  assert.equal(JSON.parse(toMineruJSON(md)).pdf_info[0].para_blocks[0].lines[0].spans[0].content,'Hello');
  assert.throws(()=>toMarkdown('{'),SyntaxError);
});


test('page evidence and start-only boundaries reject injected or changed records',()=>{
  const md=toMarkdown(raw);
  const next='<!-- minerujson:block:v1:1:0 -->';
  assert(md.includes(next));
  assert.equal(toMineruJSON(md),raw);
  assert.throws(()=>toMineruJSON(md.replace('<!-- minerujson:page:v1:1\n',
    '<!-- minerujson:page:v1:7\n')),/INVALID/);
  assert.throws(()=>toMineruJSON(md.replace(next,'injected body\n\n'+next)),/INVALID/);
  assert.throws(()=>toMineruJSON(md.replace(next,'<!-- minerujson:block:v1:1:5 -->')),/INVALID/);
  assert.throws(()=>toMineruJSON(md.replace(next,
    '<!-- minerujson:end:v1:0:16 -->\n\n'+next)),/INVALID/);
  // The last page and EOF also belong outside the preceding body.
  assert.throws(()=>toMineruJSON(md.replace(/(<!-- minerujson:source:v1:)/,'extra\n\n$1')),/INVALID/);
});

test('zero-block pages and chapter annotations preserve strict source data',()=>{
  const sample=structuredClone(original);
  sample.pdf_info.splice(1,0,{page_idx:999,para_blocks:[],discarded_blocks:[]});
  sample.pdf_info.push({page_idx:1000,para_blocks:[],discarded_blocks:[]});
  const md=toMarkdown(sample);
  assert.equal(toMineruJSON(md),JSON.stringify(sample));
  const annotated=toMarkdown(raw).replace('<!-- minerujson:block:v1:0:0 -->\n\n',
    '<!-- minerujson:block:v1:0:0 -->\n\n<!-- ocr2md:chapter:v1 id="mineru:0:0:0" independent="1" -->\n');
  assert.equal(toMineruJSON(annotated),raw);
  assert.throws(()=>toMineruJSON(annotated.replace('id="mineru:0:0:0"','id="mineru:0:1:0"')),/INVALID/);
});

test('quoted MinerU anchors and their contents still reverse to the same original JSON',()=>{
  const quoted=saved.replace('<!-- minerujson:block:v1:0:0 -->\n\n## Bufett’s Alpha',
    '> <!-- minerujson:block:v1:0:0 -->\n\n> ## Bufett’s Alpha');
  assert.notEqual(quoted,saved);
  assert.equal(toMineruJSON(quoted),raw);
  const nested=quoted.replace('> <!-- minerujson:block:v1:0:0 -->',
    '>> <!-- minerujson:block:v1:0:0 -->').replace('> ## Bufett’s Alpha','>> ## Bufett’s Alpha');
  assert.equal(toMineruJSON(nested),raw);
  assert.throws(()=>toMineruJSON(nested.replace('>> ## Bufett’s Alpha','> ## Bufett’s Alpha')),
    /inconsistent quote depth/);
});
