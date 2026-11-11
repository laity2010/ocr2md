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
export default defineConfig({
  root,publicDir,base:'/labs/lab-ocr/',
  define:{__FRAME_BUILD_VERSION__:JSON.stringify(version),__FRAME_SOURCE_COMMIT__:JSON.stringify(sha),
    __FRAME_APP_ID__:JSON.stringify('lab-ocr')},
  build:{outDir,emptyOutDir:true},
  plugins:[{name:'lab-ocr-release-version',generateBundle(){this.emitFile({type:'asset',fileName:'release-version.json',
    source:JSON.stringify({schema:'ocr2md-frame/v1',name:'lab-ocr',version,commit:sha})+'\n'});}}],
});
