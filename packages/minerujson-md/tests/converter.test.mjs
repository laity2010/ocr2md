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
  assert.equal(toMarkdown(raw),saved);
  assert.equal(toMineruJSON(saved),raw);
  const count = original.pdf_info.reduce((sum,p)=>sum+p.para_blocks.length,0);
  assert.equal(saved.match(/<!-- minerujson:block:v1:/g)?.length,count);
  assert.equal(count,224);
});

test('valid GFM / HTML comments / images / math code / tables',()=>{
  const tree=parse.parse(saved);
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
  assert.throws(()=>toMineruJSON(saved.replace('<!-- minerujson:end:v1:0:0 -->','')),/INVALID/);
  assert.throws(()=>toMineruJSON(saved.replace(/(<!-- minerujson:source:v1:)[a-f0-9]/,'$1f')),/INVALID/);
  assert.throws(()=>toMineruJSON('# untracked\n\n'+saved),/INVALID/);
});

test('input can also be parsed JSON object; corrupted JSON rejected',()=>{
  const md=toMarkdown({pdf_info:[{page_idx:0,para_blocks:[{type:'title',level:1,lines:[{spans:[{type:'text',content:'Hello'}]}]}]}]});
  assert.equal(JSON.parse(toMineruJSON(md)).pdf_info[0].para_blocks[0].lines[0].spans[0].content,'Hello');
  assert.throws(()=>toMarkdown('{'),SyntaxError);
});
