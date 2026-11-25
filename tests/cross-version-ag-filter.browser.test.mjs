/** Real V3 AG Grid + V1 EnumCheckboxFilter browser regression (Chromium + iPad-WebKit).
 * Serves the actual built labs/lab-ocr-v3/dist/ bundle over loopback HTTP and verifies:
 * 1) V3 identity, isolated localStorage key, zero console/page errors;
 * 2) Native AG column filter button opens V1 EnumCheckboxFilter popup on Type column;
 * 3) all / uncheck / multi-checkbox / transient empty rows preservation / restore all.
 */
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import http from 'node:http';
import {extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const DIST=resolve(fileURLToPath(new URL('../labs/lab-ocr-v3/dist',import.meta.url)));
assert.equal(existsSync(join(DIST,'index.html')),true,'Build labs/lab-ocr-v3/dist first');

const HOST='127.0.0.1';
const MIME={
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml',
  '.woff2':'font/woff2',
  '.png':'image/png',
};

const server=http.createServer((req,res)=>{
  const url=new URL(req.url,`http://${HOST}`);
  if(url.pathname.startsWith('/labs/lab-frame/api/workspace-io/')){
    res.writeHead(403,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({error:'isolated test mode'}));
    return;
  }
  if(!url.pathname.startsWith('/labs/lab-ocr-v3/')){
    res.writeHead(404);res.end('Not found');return;
  }
  const rel=url.pathname.slice('/labs/lab-ocr-v3/'.length)||'index.html';
  const file=resolve(DIST,rel);
  if(!file.startsWith(DIST)||!existsSync(file)||!statSync(file).isFile()){
    res.writeHead(404);res.end('Missing asset');return;
  }
  const type=MIME[extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});
  res.end(readFileSync(file));
});

await new Promise(done=>server.listen(0,HOST,done));
const {port}=server.address();
const baseUrl=`http://${HOST}:${port}/labs/lab-ocr-v3/`;

const SAMPLE_ROWS=[
  {pbs:'p0b0s0',block_type:'title',md_block:'# Chapter 1'},
  {pbs:'p0b1s0',block_type:'text',md_block:'Opening paragraph.'},
  {pbs:'p0b2s0',block_type:'table',md_block:'<table><tr><td>1</td></tr></table>'},
  {pbs:'p0b3s0',block_type:'text',md_block:'Second paragraph.'},
];

try{
  for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1032,height:642},hasTouch:true});
      const errors=[];
      page.on('pageerror',err=>errors.push('pageerror: '+err.message));
      page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text());});

      await page.goto(baseUrl,{waitUntil:'networkidle'});
      const brand=await page.locator('#lab-frame-home').textContent();
      assert.equal(brand?.trim(),'OCR2MD lab-ocr-v3',`${name}: brand mismatch`);

      // Switch to V3 frame pane and populate isolated fixture rows into the real AG Grid.
      await page.evaluate(rows=>{
        document.dispatchEvent(new Event('v3-show-frame'));
        const host=document.querySelector('#workspace .ocr-outline-grid');
        host.v3GridPort.setRows(rows);
      },SAMPLE_ROWS);

      await page.waitForSelector('#workspace:not([hidden]) .ag-header-cell[col-id="block_type"]');

      // Ensure NO custom <select> header filter exists and native AG filter button IS present.
      const headerAudit=await page.evaluate(()=>{
        const cell=document.querySelector('#workspace .ag-header-cell[col-id="block_type"]');
        return {
          hasCustomSelect:Boolean(cell?.querySelector('select')),
          hasNativeFilterBtn:Boolean(cell?.querySelector('.ag-header-cell-filter-button,[data-ref="eFilterButton"]')),
          displayed:document.querySelector('#workspace .ocr-outline-grid')?.v3GridPort.getDisplayedRows().length,
        };
      });
      assert.equal(headerAudit.hasCustomSelect,false,`${name}: custom select forbidden`);
      assert.equal(headerAudit.hasNativeFilterBtn,true,`${name}: native AG filter button missing`);
      assert.equal(headerAudit.displayed,4,`${name}: expected 4 initial rows`);

      // Open the REAL AG native filter popup on the Type column.
      const filterBtn=page.locator('#workspace .ag-header-cell[col-id="block_type"] .ag-header-cell-filter-button, #workspace .ag-header-cell[col-id="block_type"] [data-ref="eFilterButton"]').first();
      await filterBtn.click();
      await page.waitForSelector('.ocr-enum-filter[aria-label="Type 筛选"]');

      const cb=val=>page.locator(`.ocr-enum-filter [data-filter-value="${val}"] input`);
      assert.equal(await cb('all').isChecked(),true,`${name}: all should start checked`);

      // Uncheck text & title -> only table remains.
      await cb('text').uncheck();
      await cb('title').uncheck();
      let visibleTypes=await page.evaluate(()=>
        document.querySelector('#workspace .ocr-outline-grid').v3GridPort.getDisplayedRows().map(r=>r.block_type));
      assert.deepEqual(visibleTypes,['table'],`${name}: single type filter failed`);

      // Multi-select: re-check title -> table + title remain.
      await cb('title').check();
      visibleTypes=await page.evaluate(()=>
        document.querySelector('#workspace .ocr-outline-grid').v3GridPort.getDisplayedRows().map(r=>r.block_type));
      assert.deepEqual(visibleTypes,['title','table'],`${name}: multi-checkbox filter failed`);

      // Transient empty row update must NOT wipe out the selected filter model.
      await page.evaluate(rows=>{
        const port=document.querySelector('#workspace .ocr-outline-grid').v3GridPort;
        port.setRows([]);
        port.setRows(rows);
      },SAMPLE_ROWS);
      visibleTypes=await page.evaluate(()=>
        document.querySelector('#workspace .ocr-outline-grid').v3GridPort.getDisplayedRows().map(r=>r.block_type));
      assert.deepEqual(visibleTypes,['title','table'],`${name}: transient empty rows reset filter`);

      // Restore all.
      await cb('all').check();
      visibleTypes=await page.evaluate(()=>
        document.querySelector('#workspace .ocr-outline-grid').v3GridPort.getDisplayedRows().map(r=>r.block_type));
      assert.equal(visibleTypes.length,4,`${name}: restore all failed`);

      // Verify release-version.json & isolated storage key (must not touch lab-frame or lab-ocr-v2 keys).
      const isolation=await page.evaluate(async()=>{
        const ver=await (await fetch(new URL('release-version.json',location.href))).json();
        return {ver,keys:Object.keys(localStorage)};
      });
      assert.equal(isolation.ver.name,'lab-ocr-v3');
      assert.equal(isolation.keys.some(k=>k.includes('lab-ocr-v2')||k.includes('lab-frame')),false);
      assert.deepEqual(errors,[],`${name}: unexpected console/page errors: ${errors.join('; ')}`);

      console.log('V3_CROSS_VERSION_AG_FILTER_BROWSER_PASS',name,'native-popup/multi/transient/isolation');
    }finally{
      await browser.close();
    }
  }
}finally{
  server.close();
}
