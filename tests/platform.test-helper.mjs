/** Cross-platform browser executables and PNG→JPEG for browser tests.
 * macOS keeps the exact historical behavior (Google Chrome stable app,
 * pinned Playwright WebKit 2359 build, `sips` conversion) when present.
 * Elsewhere: explicit env override, else Playwright's bundled browsers.
 */
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const MAC_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MAC_WEBKIT=homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh';
const pick=(names,mac)=>{
  for(const name of names) if(process.env[name]) return process.env[name];
  if(process.platform==='darwin'&&existsSync(mac)) return mac;
  return undefined; // Playwright launches its own lockfile-pinned browser.
};
export const chromeExecutable=()=>pick(['OCR2MD_CHROME_PATH','OCR2MD_AUDIT_CHROME_PATH'],MAC_CHROME);
export const webkitExecutable=()=>pick(['OCR2MD_WEBKIT_PATH','OCR2MD_AUDIT_WEBKIT_PATH'],MAC_WEBKIT);

/** Convert PNG→JPEG. `best` mirrors sips `-s formatOptions best`. */
export function pngToJpeg(source,destination,{best=false}={}){
  if(process.platform==='darwin'){
    execFileSync('sips',['-s','format','jpeg',...(best?['-s','formatOptions','best']:[]),source,'--out',destination],{stdio:'ignore'});
    return;
  }
  const helper=fileURLToPath(new URL('./png-to-jpeg.test-helper.mjs',import.meta.url));
  execFileSync(process.execPath,[helper,source,destination],{stdio:'ignore'});
}
