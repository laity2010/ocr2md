/** Non-macOS PNG→JPEG via real Chromium rendering (quality 100). */
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {chromeExecutable} from './platform.test-helper.mjs';
const [source,destination]=process.argv.slice(2);
if(!source||!destination) throw Error('JPEG_ARGUMENTS_REQUIRED');
const bytes=readFileSync(source);
if(!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) throw Error('JPEG_EXPECTS_PNG');
const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
if(w<=0||h<=0||w>8192||h>8192) throw Error('JPEG_INVALID_DIMENSIONS');
const browser=await chromium.launch({headless:true,executablePath:chromeExecutable()});
try{
  const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});
  await page.setContent(`<body style="margin:0"><img style="display:block;width:${w}px;height:${h}px" src="data:image/png;base64,${bytes.toString('base64')}"></body>`);
  await page.locator('img').screenshot({path:destination,type:'jpeg',quality:100});
}finally{await browser.close();}
