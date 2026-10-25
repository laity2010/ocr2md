import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';

const lab=dirname(fileURLToPath(import.meta.url));
const root=resolve(lab,'../..');
const stamp=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).formatToParts(new Date());
const part=k=>stamp.find(x=>x.type===k).value;
const baseCommit=execFileSync('git',['log','-1','--format=%H','--','ui/'],{cwd:root,encoding:'utf8'}).trim();
const version=`lab-cm-html-${part('year')}${part('month')}${part('day')}-${part('hour')}${part('minute')}${part('second')}`;
export default defineConfig({
  root:lab,
  base:'/labs/cm-html/',
  publicDir:join(root,'ui/public'), // fonts copied from unchanged V6 sources
  define:{__V6_BUILD_VERSION__:JSON.stringify(version)},
  plugins:[{
    name:'lab-mainline-core-fork',enforce:'pre',
    transform(code,id){
      if(!id.split('?')[0].replaceAll('\\','/').startsWith(join(root,'ui/')))return;
      // Prefix the V6 transport, never edit its business modules.
      return code.replaceAll("'/api/", "'/labs/cm-html/api/")
        .replaceAll('"/api/', '"/labs/cm-html/api/')
        .replaceAll("'/healthz'", "'/labs/cm-html/healthz'")
        .replaceAll("'/media/", "'/labs/cm-html/media/")
        .replaceAll('"/media/', '"/labs/cm-html/media/');
    },
    generateBundle(){
      this.emitFile({type:'asset',fileName:'release-version.json',
        source:JSON.stringify({version,scope:'labs/cm-html',baseCommit})+'\n'});
    },
  }],
  build:{outDir:join(lab,'dist'),emptyOutDir:true},
  server:{fs:{allow:[root]},host:'127.0.0.1',port:5221,strictPort:true},
});
