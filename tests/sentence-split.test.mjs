import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {importSnapshot,sha256} from '../ui/sentence/snapshot.js';
import {ENGINE_IDS,splitBlock,rebuildBlock,splitSnapshot,projectBlock} from '../ui/sentence/split.js';
test('three real engines, exact protected source and emoji',async()=>{
 const text='# Sample title. Dr. Smith saw a fox. It ran. $x+y$ ![](media/a.png) 😀\n\n';
 const block={logicalId:1,blockType:'text',text,sha256:await sha256(text)};
 assert.equal(ENGINE_IDS.length,3);
 for(const id of ENGINE_IDS){const r=splitBlock(block,id);assert.equal(rebuildBlock(r),text);assert(r.units.length>1);assert(r.units.every(u=>!u.original.includes('media/')&&!u.original.includes('x+y')));}
 const raw={...block,blockType:'interline_equation'};for(const id of ENGINE_IDS){const r=splitBlock(raw,id);assert.equal(r.units.length,0);assert.equal(rebuildBlock(r),text);}
});
test('real V2 isolated SQLite: each engine covers every eligible character or reports error',async()=>{
 const f=JSON.parse(execFileSync('python3',['-c',"import sys,tempfile,json; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from test_v2_owned_edit import prepare_owned_book; tmp=tempfile.TemporaryDirectory(); print(json.dumps(prepare_owned_book(Path(tmp.name)),ensure_ascii=False))",'../lab-ocr-v2/tests'],{encoding:'utf8',maxBuffer:32*1024*1024}));
 const snapshot=await importSnapshot(f),rows=splitSnapshot(snapshot);
 assert.equal(rows.length,267);
 let count=0;const failed=[];
 for(let i=0;i<rows.length;i++){const b=snapshot.blocks[i];for(const c of rows[i].candidates){if(c.error){failed.push([b.logicalId,c.engine,c.error]);continue;}assert.equal(rebuildBlock(c),b.text);const expected=projectBlock(b).map.filter(x=>x!==null),actual=c.units.flatMap(u=>u.sourceRanges.flatMap(r=>Array.from({length:r.to-r.from},(_,i)=>r.from+i)));assert.deepEqual(actual,expected);count++;}}
 console.log('ACTUAL_ENGINE_COVERAGE',count,'/',rows.length*3,'errors',JSON.stringify(failed.slice(0,10)));
 assert.equal(count,rows.length*3);
});
