/** Audit-only Linux replacement for the two frozen tests using macOS sips.
 * Patch exactly the ESM execFileSync binding inside browser test processes.
 * Conversion uses the lockfile's real Chromium to create decodable JPEGs from
 * each test-generated PNG, keeping image bytes identical for preview/download.
 */
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {resolve,basename} from 'node:path';

if(process.platform==='linux' && basename(process.argv[1]||'').endsWith('.test.mjs')){
  const original=childProcess.execFileSync;
  childProcess.execFileSync=function(command,args=[],options={}){
    if(command!=='sips') return original.call(this,command,args,options);
    const outputIndex=args.indexOf('--out');
    if(outputIndex<1 || outputIndex+1>=args.length)
      throw Error('AUDIT_SIPS_UNSUPPORTED_ARGS: '+JSON.stringify(args));
    const source=args[outputIndex-1], output=args[outputIndex+1];
    if(!/\.png$/i.test(source)||!/\.jpe?g$/i.test(output) || !args.includes('jpeg'))
      throw Error('AUDIT_SIPS_UNSUPPORTED_CONVERSION: '+JSON.stringify(args));
    const helper=resolve('.v6/audit-reports/audit-png-to-jpeg.mjs');
    const result=original.call(this,process.execPath,[helper,source,output],options);
    console.log('AUDIT_LINUX_SIPS_SHIM',basename(source),'->',basename(output));
    return result;
  };
  syncBuiltinESMExports();
}
