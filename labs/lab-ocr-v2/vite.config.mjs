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
const frameBaseline='da903ef8e37e98931d4809e65e6052c653be7f1b';
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
        // V2-only build adapter: replace Frame's single empty EditorView mount,
        // NOT its shared layout or a second editor/instance.
        code=exact(code,"import {EditorState} from '@codemirror/state';",
          "import {mountV2PreviewSlot,mountV2DetachedPDF} from '../v2-preview-slot.js';\nimport {mountV2Source} from '../v2-source-session.js';\nimport {EditorState} from '@codemirror/state';",
          'single CM6 source adapter import');
        code=exact(code,'element.append(body);owned=()=>mountEmptySource(body);',
          'element.append(body);owned=()=>mountV2Source(body);',
          'single V2 source editor mount');
        // Adapt the V1 lab-ocr Frame PDF slot without changing Frame source.
        // PDF.js ownership is the preview pane, not the disposable split panel.
        code=exact(code,"function blankPane(name,onSplit,onModuleChange){",
          "function blankPane(name,onSplit,onModuleChange,pdfSlot){",
          'V1 PDF slot passed into Frame pane');
        code=exact(code,"  let split=false;\n  const dockview=createDockview",
          "  let split=false;\n  const pdfSlot={preview:null,detached:null,current:null};\n  const dockview=createDockview",
          'V1 single PDF.js owner');
        code=exact(code,"blankPane(name,setSplit,onModuleChange)",
          "blankPane(name,setSplit,onModuleChange,pdfSlot)",
          'Frame PDF slot propagation');
        code=exact(code,'<option value="pdf" disabled>PDF 原文</option>',
          '<option value="pdf">PDF 原文</option>',
          'V1 unsplit PDF option');
        code=exact(code,"element.append(area);\n    element.setAttribute('aria-label','Markdown 预览（空白）');",
          "const pdfTools=document.createElement('div');pdfTools.className='ocr-preview-mode-tools';pdfTools.dataset.mode='pdf';pdfTools.hidden=true;bar.append(pdfTools);\n"+
          "const pdfSurface=document.createElement('div');pdfSurface.className='ocr-preview-pdf-host';pdfSurface.dataset.pdfTheme='dark';\n"+
          "element.append(area,pdfSurface);owned=()=>mountV2PreviewSlot({pane:element,mdScroller:area,modeSelect:mode,pdfSurface,pdfTools,pdfSlot});\n"+
          "element.setAttribute('aria-label','Markdown / PDF 预览');",
          'V1 permanent PDF and Markdown preview slot');
        code=exact(code,'host.append(surface);element.append(host);',
          'host.append(surface);element.append(host);owned=()=>mountV2DetachedPDF({surface,actions,pdfSlot});',
          'V1 move the SAME PDF viewer and native controls');
        return exact(code,'return {dispose(){grid.destroy();},layout:()=>{}};',
          "host.v2BaseGridPort=Object.freeze({setColumns:cols=>grid.setGridOption('columnDefs',cols),setRows:rows=>grid.setGridOption('rowData',rows),getColumns:()=>grid.getColumnDefs(),onRowClicked:handler=>{grid.addEventListener('rowClicked',handler);return ()=>grid.removeEventListener('rowClicked',handler);},focusRow:(field,id)=>{grid.setGridOption('rowClassRules',{'v2-sync-ag-row':p=>p.data?.[field]===id});grid.redrawRows();for(let i=0;i<grid.getDisplayedRowCount();i++){const node=grid.getDisplayedRowAtIndex(i);if(node?.data?.[field]===id){grid.ensureIndexVisible(i,'auto');return true;}}return false;}});return {dispose(){grid.destroy();},layout:()=>{}};",
          'AG view data port');
      }
      if(id.endsWith('/ui/frame/refresh.js')){
        return exact(code,"remote?.name==='lab-frame'","remote?.name==='lab-ocr-v2'",'auto-update identity');
      }
    },
    generateBundle(){
      this.emitFile({type:'asset',fileName:'release-version.json',source:JSON.stringify({
        schema:'ocr2md-frame/v1',name,version,commit,frameBaseline,
        stage:'wp06-ag-logical-p-focus-filter-all-f02',
      })+'\n'});
    },
  }],
});
