import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';

const lab=dirname(fileURLToPath(import.meta.url));
const root=resolve(lab,'../..');
const stamp=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).formatToParts(new Date());
const part=k=>stamp.find(x=>x.type===k).value;
const version=`lab-cm-html-${part('year')}${part('month')}${part('day')}-${part('hour')}${part('minute')}${part('second')}`;
export default defineConfig({
  root:lab,
  base:'/labs/cm-html/',
  publicDir:join(root,'ui/public'), // fonts copied from unchanged V6 sources
  define:{__LAB_VERSION__:JSON.stringify(version)},
  plugins:[{
    name:'lab-only-outline-override',enforce:'pre',
    resolveId(source,importer){
      // Redirect precisely one dependency: workspace's outline renderer.
      // All other V6 sources are read without editing or copying.
      if(source==='./outline-grid.js' &&
         importer?.replaceAll('\\','/').split('?')[0]===join(root,'ui/workspace.js'))
        return join(lab,'outline-grid.js');
    },
    generateBundle(){
      this.emitFile({type:'asset',fileName:'release-version.json',
        source:JSON.stringify({version,scope:'labs/cm-html'})+'\n'});
    },
  }],
  build:{outDir:join(lab,'dist'),emptyOutDir:true},
  server:{fs:{allow:[root]},host:'127.0.0.1',port:5221,strictPort:true},
});
