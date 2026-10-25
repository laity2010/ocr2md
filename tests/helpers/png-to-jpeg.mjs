/** Cross-platform real-image JPEG fixture conversion, without macOS `sips`.
 * Uses the same lockfile Playwright Chromium as the browser regression tests.
 */
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

export async function pngToJpeg(source,destination){
  const png=readFileSync(source);
  if(!png.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))
    throw Error('TEST_JPEG_EXPECTS_PNG');
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  if(!width||!height||width>8192||height>8192)
    throw Error('TEST_JPEG_INVALID_DIMENSIONS');
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    try{
      await page.setContent(`<body style="margin:0"><img style="display:block;width:${width}px;height:${height}px" src="data:image/png;base64,${png.toString('base64')}"></body>`);
      await page.locator('img').screenshot({path:destination,type:'jpeg',quality:100});
    }finally{await page.close();}
  }finally{await browser.close();}
}
