/** Browser-native module smoke, deliberately separate from the future AG WP2.
 * No SQL, no user workspace or PDF is mounted; tests read-only API parity.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium,webkit,devices} from 'playwright';

const source=readFileSync('ui/lab-ocr/note-match-index.js');
const server=createServer((req,res)=>{
  if(req.url==='/note-match-index.js'){
    res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
    res.end(source);
  }else if(req.url==='/'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end('<!doctype html><meta charset="utf-8"><main id="workspace">READ ONLY</main>');
  }else{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`;
try{
  for(const [name,browserType,options] of [
    ['Chromium',chromium,{viewport:{width:1280,height:880}}],
    ['iPad-WebKit',webkit,{...devices['iPad Pro 11'],isMobile:true}],
  ]){
    const browser=await browserType.launch({headless:true});
    try{
      const page=await browser.newPage(options),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(root,{waitUntil:'domcontentloaded'});
      const result=await page.evaluate(async()=>{
        const {projectNoteMatchIndex,validateNoteMatchConfig}=await import('./note-match-index.js');
        const texts=['# Chapter 1','Explicit<sup>1</sup> and alternate† and [2].',
          '```','Hidden<sup>2</sup>','```','## Notes','1. First note','† Symbol note','[2] Bracket note'];
        const md=texts.map((text,index)=>({line_no:index+1,line_id:'l'+index,
          block_id:100+index,text}));
        const blocks=texts.map((_,index)=>({block_id:100+index,
          pbs:'p1b'+index,global_page:0,block_type:'text',block_group:'para_blocks'}));
        const original=JSON.stringify(md),out=projectNoteMatchIndex(md,blocks);
        const other=projectNoteMatchIndex(md,blocks,{weakAutoMatch:true});
        const custom=validateNoteMatchConfig({referenceRules:[],bodyRules:[],customRules:[
          {id:'book.ref.c',kind:'reference',pattern:'§(?<id>\\d+)',strength:'strong'},
          {id:'book.body.c',kind:'body',pattern:'^§(?<id>\\d+): (?<content>.+)$',strength:'strong'},
        ]});
        return {stats:out.stats,weak:other.stats,
          locations:out.references.map(row=>[row.line_id,row.block_id,row.from,row.to,row.evidence.rule_id]),
          sourceUnchanged:JSON.stringify(md)===original,
          noteRoot:document.querySelector('main#workspace')?.textContent,
          customRules:custom.customRules.length};
      });
      assert.deepEqual({...result.stats},{references:3,bodies:3,matched:1,
        need_review:2,conflict:0,missing_body:0,orphan_bodies:0});
      assert.equal(result.weak.matched,3);
      assert.equal(result.sourceUnchanged,true);
      assert.equal(result.noteRoot,'READ ONLY');
      assert.equal(result.customRules,2);
      assert(result.locations.every(x=>x[0]&&Number.isInteger(x[1])&&x[3]>x[2]));
      assert.deepEqual(errors,[]);
      console.log('LAB_OCR_NOTE_MATCH_WP1_BROWSER_PASS',name,result.stats);
    }finally{await browser.close();}
  }
}finally{await new Promise(resolve=>server.close(resolve));}
