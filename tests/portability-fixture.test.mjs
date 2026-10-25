/** Linux/Mac smoke: a real JPEG fixture is generated without macOS-only tools. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pngToJpeg} from './helpers/png-to-jpeg.mjs';

test('PNG fixture converts into real JPEG using Playwright Chromium',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'ocr2md-portability-'));
  try{
    const source=join(dir,'source.png'),output=join(dir,'fixture.jpg');
    writeFileSync(source,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9hCeEEsAAAAASUVORK5CYII=','base64'));
    await pngToJpeg(source,output);
    const jpg=readFileSync(output);
    assert(jpg.length>100,'empty image is not a valid fixture');
    assert(jpg.subarray(0,2).equals(Buffer.from('ffd8','hex')),'missing JPEG SOI');
    assert(jpg.subarray(-2).equals(Buffer.from('ffd9','hex')),'missing JPEG EOI');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Vite and browser tests have no hard-coded macOS runner/fixture paths',()=>{
  const sources=['vite.config.mjs',...readdirSync('tests',{recursive:true})
    .filter(p=>p.endsWith('.mjs')&&!p.includes('portability-fixture.test.mjs'))
    .map(p=>'tests/'+p)];
  for(const path of sources){
    const text=readFileSync(path,'utf8');
    for(const pattern of [/Google Chrome\.app\/Contents\/MacOS\/Google Chrome/,
      /Library\/Caches\/ms-playwright\/webkit-\d+/,
      /execFileSync\(['"]sips['"]/,/iCloud~md~obsidian/]){
      assert(!pattern.test(text),`${path} contains a machine-specific dependency: ${pattern}`);
    }
  }
});
