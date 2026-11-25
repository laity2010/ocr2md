/** Isolated OCR Review experiment bootstrap, derived from the frame/base shell. */
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../ui/lab-ocr/',import.meta.url));
const publicDir=false;
const outDir=fileURLToPath(new URL('./dist/',import.meta.url));
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const now=new Date();
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
const p=k=>parts.find(x=>x.type===k).value;
const version=`v6-lab-ocr-${p('year')}${p('month')}${p('day')}-${p('hour')}${p('minute')}${p('second')}`;
// Federal construction registration: build only, never dev-server/reader traffic.
import {existsSync as federalBuildExists} from 'node:fs';
import {fileURLToPath as federalBuildPath} from 'node:url';
import {execFileSync as federalBuildExec} from 'node:child_process';
const federalBuildRegistration={name:'ocr2md-federal-build-record',enforce:'pre',config(_config,{command}){
  if(command!=='build')return;
  const federalRoot=new URL('../../../../',import.meta.url);
  if(!federalBuildExists(new URL('main/constitution/',federalRoot))||!federalBuildExists(new URL('labs/',federalRoot)))return;
  federalBuildExec('python3',[federalBuildPath(new URL('.ops/git-gate.py',federalRoot)),
    'check-start','--tree',federalBuildPath(new URL('../../',import.meta.url))],{stdio:'inherit'});
}};
export default defineConfig({
  root,publicDir,base:'/labs/lab-ocr/',
  define:{__FRAME_BUILD_VERSION__:JSON.stringify(version),__FRAME_SOURCE_COMMIT__:JSON.stringify(sha),
    __FRAME_APP_ID__:JSON.stringify('lab-ocr')},
  build:{outDir,emptyOutDir:true},
  plugins:[federalBuildRegistration,{name:'lab-ocr-release-version',generateBundle(){this.emitFile({type:'asset',fileName:'release-version.json',
    source:JSON.stringify({schema:'ocr2md-frame/v1',name:'lab-ocr',version,commit:sha})+'\n'});}}],
});
