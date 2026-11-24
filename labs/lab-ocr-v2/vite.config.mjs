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
      html=exact(html,'正在初始化空白框架','正在初始化逻辑块审阅','V2 startup status');
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
          "document.addEventListener('v2-show-frame',()=>void showModule('frame'));"+
          // Frame F03 reloads unconditionally. In V2 only, defer auto-update
          // while a structural transaction is dirty; WebKit may ignore
          // beforeunload prompts, so never use them as the sole protection.
          "startFrameAutoUpdate({version:build,report:topStatus,fetchVersion:async()=>{"+
          "const r=await fetch(new URL('release-version.json',location.href),{cache:'no-store'});"+
          "if(!r.ok)throw Error('HTTP '+r.status);const remote=await r.json();"+
          "return document.querySelector('#workspace #editor')?.v2SourcePort?.getState().dirty?"+
          "{...remote,version:build}:remote;}});",
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
        // WP22: V2 presentation only. Keep Frame/V1 source and APIs unchanged.
        // The AG strip has its module select already; do not waste width on a
        // redundant "AG 表" prefix, and label V2's actual review module.
        code=exact(code,"const label=document.createElement('span');label.className='ocr-ag-toolbar-label';label.textContent='AG 表';",
          "",'V2 redundant AG label removed');
        code=exact(code,'bar.append(label,picker);element.append(bar);',
          'bar.append(picker);element.append(bar);','V2 AG toolbar one module picker');
        code=exact(code,"picker.add(new Option('空白框架','frame'));",
          "picker.add(new Option('逻辑块审阅','frame'));",'V2 module title');
        code=exact(code,"picker.title='空白框架 AG 模块切换不可用';",
          "picker.title='逻辑块审阅模块 · 导航由源码窗管理';",'V2 module tooltip');
        // The same V1 PDF.js viewer begins in the single preview pane.
        code=exact(code,"    const split=document.createElement('label');split.className='ocr-preview-split-toggle';",
          "    mode.value='pdf';\n    const split=document.createElement('label');split.className='ocr-preview-split-toggle';",
          'V2 initial PDF mode');
        code=exact(code,"checkbox.type='checkbox';checkbox.checked=true;",
          "checkbox.type='checkbox';checkbox.checked=false;",'V2 initial unsplit preview');
        code=exact(code,`  setSplit(true);
  return Object.freeze({setSplit,activate(){if(container.clientWidth&&container.clientHeight)
    dockview.layout(container.clientWidth,container.clientHeight);},`,
          `  // WP22: initial three-pane layout, PDF in the lower two-thirds.
  let sized=false;
  return Object.freeze({setSplit,activate(){
    if(!container.clientWidth||!container.clientHeight)return;
    dockview.layout(container.clientWidth,container.clientHeight);
    if(!sized){
      dockview.getPanel('preview')?.api.setSize({height:Math.round(container.clientHeight*2/3)});
      sized=true;
    }
  },`, 'V2 initial right-hand PDF two-thirds native Dockview size');
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
          "const manualWidths=new Map();let liveTable='';grid.addEventListener('columnResized',e=>{if(e.finished&&(e.source==='uiColumnResized'||e.source==='autosizeColumns')&&e.column)manualWidths.set(liveTable+':'+e.column.getColId(),e.column.getActualWidth());});host.v2BaseGridPort=Object.freeze({setColumns:(cols,table)=>{liveTable=table;grid.setGridOption('columnDefs',cols);const keep=cols.filter(c=>manualWidths.has(table+':'+c.field)).map(c=>({key:c.field,newWidth:manualWidths.get(table+':'+c.field)}));if(keep.length)grid.setColumnWidths(keep,'api');},fitColumns:widths=>{const current=new Map(grid.getColumnState().map(c=>[c.colId,c.width]));const changes=Object.entries(widths).filter(([key,width])=>!manualWidths.has(liveTable+':'+key)&&current.has(key)&&Math.abs(current.get(key)-width)>1).map(([key,width])=>({key,newWidth:width}));if(changes.length)grid.setColumnWidths(changes,'api');},getColumnState:()=>grid.getColumnState(),setRowHeight:height=>{if(grid.getGridOption('rowHeight')!==height){grid.setGridOption('rowHeight',height);grid.resetRowHeights();}},setRows:rows=>grid.setGridOption('rowData',rows),getColumns:()=>grid.getColumnDefs(),getFilterModel:()=>grid.getFilterModel(),setFilterModel:model=>grid.setFilterModel(model),getDisplayedRows:()=>{const rows=[];for(let i=0;i<grid.getDisplayedRowCount();i++)rows.push(grid.getDisplayedRowAtIndex(i)?.data);return rows;},onRowClicked:handler=>{grid.addEventListener('rowClicked',handler);return ()=>grid.removeEventListener('rowClicked',handler);},focusRow:(field,id)=>{grid.setGridOption('rowClassRules',{'v2-sync-ag-row':p=>p.data?.[field]===id});grid.redrawRows();for(let i=0;i<grid.getDisplayedRowCount();i++){const node=grid.getDisplayedRowAtIndex(i);if(node?.data?.[field]===id){grid.ensureIndexVisible(i,'auto');return true;}}return false;}});return {dispose(){grid.destroy();},layout:()=>{}};",
          'AG view data port');
      }
      if(id.endsWith('/ui/frame/refresh.js')){
        return exact(code,"remote?.name==='lab-frame'","remote?.name==='lab-ocr-v2'",'auto-update identity');
      }
    },
    generateBundle(){
      this.emitFile({type:'asset',fileName:'release-version.json',source:JSON.stringify({
        schema:'ocr2md-frame/v1',name,version,commit,frameBaseline,
        stage:'wp28-block-break',
      })+'\n'});
    },
  }],
});
