/** Linux audit compatibility smoke: exercises frozen tests' actual sips call. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
if(process.platform!=='linux') throw Error('AUDIT_SIPS_SMOKE_ONLY_LINUX');
const png=resolve('.v6/audit-reports/linux-sips-smoke.png');
const jpg=resolve('.v6/audit-reports/linux-sips-smoke.jpg');
writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9hCeEEsAAAAASUVORK5CYII=','base64'));
execFileSync('sips',['-s','format','jpeg',png,'--out',jpg],{stdio:'pipe'});
const bytes=readFileSync(jpg);
if(bytes.length<150 || bytes[0]!==255 || bytes[1]!==216 || bytes.at(-2)!==255 || bytes.at(-1)!==217)
  throw Error('AUDIT_SIPS_JPEG_INVALID');
console.log('AUDIT_LINUX_SIPS_SMOKE_PASS bytes='+bytes.length);
