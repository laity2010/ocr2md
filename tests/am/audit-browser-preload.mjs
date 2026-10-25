/** Optional portability shim for an isolated Grok AM audit runner.
 * No application code is touched; test browser launches still run genuinely.
 * Use NODE_OPTIONS="--import=./tests/am/audit-browser-preload.mjs" only in
 * audit environments. Tests use the lockfile Playwright browser binary on all platforms.
 */
import {chromium,webkit} from 'playwright';

for(const [type,override] of [
  [chromium,process.env.OCR2MD_AUDIT_CHROME_PATH],
  [webkit,process.env.OCR2MD_AUDIT_WEBKIT_PATH],
]){
  const original=type.launch.bind(type);
  type.launch=(options={})=>{
    const final={...options};
    if(override){
      final.executablePath=override;
    }else if(process.platform!=='darwin'){
      // Any legacy custom launch options must not leak platform-specific
      // browser paths into isolated Linux audit runs.
      delete final.executablePath;
    }
    return original(final);
  };
}
