/** New Lab-OCR V2: exact Lab-Frame UI, with build-time URL/identity scoping.
 * No old V2 business; exposes only narrow, build-time base import UI ports.
 */
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const name='lab-ocr-v2';
const root=fileURLToPath(new URL('../../ui/frame/',import.meta.url));
const outDir=fileURLToPath(new URL('./dist/',import.meta.url));
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const frameBaseline='eab8ff8337db0a4bdd611d36f7788c4096f28cb3';
const format=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
const p=key=>format.find(x=>x.type===key).value;
const version=`v2-lab-frame-${p('year')}${p('month')}${p('day')}-${p('hour')}${p('minute')}${p('second')}`;
const exact=(source,oldText,newText,contract)=>{
  if(source.split(oldText).length!==2)throw Error('Lab-Frame '+contract+' contract drift: refusing parallel implementation');
  return source.replace(oldText,newText);
};
export default defineConfig({
  root,publicDir:false,base:`/labs/${name}/`,
  define:{__FRAME_BUILD_VERSION__:JSON.stringify(version),__FRAME_SOURCE_COMMIT__:JSON.stringify(commit)},
  build:{outDir,emptyOutDir:true},
  plugins:[{
    name:'v2-frame-base-import-adapter',enforce:'pre',
    transformIndexHtml:{order:'pre',handler(html){
      html=exact(html,'<title>OCR2MD V6 · Lab Frame</title>',
        '<title>OCR2MD · V2 · MinerU 无损基础表</title>','document title');
      html=exact(html,'OCR2MD lab-frame</a>','OCR2MD lab-ocr-v2</a>','brand');
      return html;
    }},
    transform(code,id){
      if(id.endsWith('/ui/frame/frame.js')){
        code=exact(code,"createFrameSettingsIO(localStorage,'lab-frame'",
          "createFrameSettingsIO(localStorage,'lab-ocr-v2-frame'",'isolated Settings storage');
        code=exact(code,'await frameWorkspaceIO.probe(selected);',
          "await frameWorkspaceIO.probe(selected);document.dispatchEvent(new CustomEvent('v2-workspace-verified',{detail:{path:selected,afterSave,uncommitted}}));",
          'verified F02 workspace event');
        return "import '../v2-mineru-entry.js';\n"+exact(code,'startFrameAutoUpdate({version:build,report:topStatus});',
          "document.addEventListener('v2-show-frame',()=>void showModule('frame'));startFrameAutoUpdate({version:build,report:topStatus});",
          'Frame module switch event');
      }
      if(id.endsWith('/ui/frame/layout.js')){
        return exact(code,'return {dispose(){grid.destroy();},layout:()=>{}};',
          "host.v2BaseGridPort=Object.freeze({setColumns:cols=>grid.setGridOption('columnDefs',cols),setRows:rows=>grid.setGridOption('rowData',rows),getColumns:()=>grid.getColumnDefs()});return {dispose(){grid.destroy();},layout:()=>{}};",
          'AG view data port');
      }
      if(id.endsWith('/ui/frame/refresh.js')){
        return exact(code,"remote?.name==='lab-frame'","remote?.name==='lab-ocr-v2'",'auto-update identity');
      }
    },
    generateBundle(){
      this.emitFile({type:'asset',fileName:'release-version.json',source:JSON.stringify({
        schema:'ocr2md-frame/v1',name,version,commit,frameBaseline,
        stage:'mineru-base-two-tables',
      })+'\n'});
    },
  }],
});
