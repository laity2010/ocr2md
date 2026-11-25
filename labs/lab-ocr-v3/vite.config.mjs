/** Lab-OCR V3: clean Lab-Frame shell with exact build-time identity scoping.
 * Preserves ui/frame/* byte-identically; enforces federal build registration.
 */
import {defineConfig} from 'vite';
import {existsSync as federalBuildExists} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const name='lab-ocr-v3';
const root=fileURLToPath(new URL('../../ui/frame/',import.meta.url));
const outDir=fileURLToPath(new URL('./dist/',import.meta.url));
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const frameBaseline='1dbc2b7e4c754330b8d3b365008e4c2e9edc39c9';
const format=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).formatToParts(new Date());
const part=key=>format.find(x=>x.type===key).value;
const version=`v3-lab-frame-${part('year')}${part('month')}${part('day')}-${part('hour')}${part('minute')}${part('second')}`;

const exact=(source,oldText,newText,contract)=>{
  if(source.split(oldText).length!==2){
    throw Error('Lab-Frame '+contract+' contract drift: refusing parallel implementation');
  }
  return source.replace(oldText,newText);
};

// Federal construction registration: formal build only, never dev-server traffic.
const federalBuildRegistration={
  name:'ocr2md-federal-build-record',
  enforce:'pre',
  config(_config,{command}){
    if(command!=='build')return;
    const federalRoot=new URL('../../../../',import.meta.url);
    if(!federalBuildExists(new URL('main/constitution/',federalRoot))||
       !federalBuildExists(new URL('labs/',federalRoot)))return;
    execFileSync('python3',[
      fileURLToPath(new URL('.ops/git-gate.py',federalRoot)),
      'check-start','--tree',fileURLToPath(new URL('../../',import.meta.url)),
    ],{stdio:'inherit'});
  },
};

export default defineConfig({
  root,
  publicDir:false,
  base:`/labs/${name}/`,
  define:{
    __FRAME_BUILD_VERSION__:JSON.stringify(version),
    __FRAME_SOURCE_COMMIT__:JSON.stringify(commit),
  },
  build:{outDir,emptyOutDir:true},
  plugins:[
    federalBuildRegistration,
    {
      name:'v3-frame-shell-adapter',
      enforce:'pre',
      transformIndexHtml:{
        order:'pre',
        handler(html){
          html=exact(html,'<title>OCR2MD V6 · Lab Frame</title>',
            '<title>OCR2MD · V3 · 工作台</title>','document title');
          html=exact(html,'OCR2MD lab-frame</a>','OCR2MD lab-ocr-v3</a>','brand');
          html=exact(html,'正在初始化空白框架','正在初始化 V3 工作台','V3 startup status');
          return html;
        },
      },
      transform(code,id){
        if(id.endsWith('/ui/frame/frame.js')){
          code=exact(code,"createFrameSettingsIO(localStorage,'lab-frame'",
            "createFrameSettingsIO(localStorage,'lab-ocr-v3'",'isolated V3 Settings storage');
          code=exact(code,'await frameWorkspaceIO.probe(selected);',
            "await frameWorkspaceIO.probe(selected);document.dispatchEvent(new CustomEvent('v3-workspace-verified',{detail:{path:selected,afterSave,uncommitted}}));",
            'verified F02 workspace event');
          return "import '../v3-shell-entry.js';\n"+exact(
            code,
            'startFrameAutoUpdate({version:build,report:topStatus});',
            "document.addEventListener('v3-show-frame',()=>void showModule('frame'));"+
            "startFrameAutoUpdate({version:build,report:topStatus,fetchVersion:async()=>{"+
            "const r=await fetch(new URL('release-version.json',location.href),{cache:'no-store'});"+
            "if(!r.ok)throw Error('HTTP '+r.status);const remote=await r.json();"+
            "return document.querySelector('#workspace #editor')?.v3SourcePort?.getState?.().dirty?"+
            "{...remote,version:build}:remote;}});",
            'V3 module switch and safe F03 auto-update',
          );
        }
        if(id.endsWith('/ui/frame/layout.js')){
          code=exact(code,"import {EditorState} from '@codemirror/state';",
            "import {mountV3PreviewSlot,mountV3DetachedPDF} from '../v3/preview-slot.js';\nimport {mountV3Source} from '../v3/source-session.js';\nimport {EditorState} from '@codemirror/state';",
            'V3 single CM6 source and preview slot import');
          code=exact(code,'element.append(body);owned=()=>mountEmptySource(body);',
            'element.append(body);owned=()=>mountV3Source(body);',
            'V3 single CM6 source mount');
          code=exact(code,'function blankPane(name,onSplit,onModuleChange){',
            'function blankPane(name,onSplit,onModuleChange,pdfSlot){',
            'V3 PDF slot passed into Frame pane');
          code=exact(code,'  let split=false;\n  const dockview=createDockview',
            '  let split=false;\n  const pdfSlot={preview:null,detached:null,current:null};\n  const dockview=createDockview',
            'V3 single PDF.js owner');
          code=exact(code,'blankPane(name,setSplit,onModuleChange)',
            'blankPane(name,setSplit,onModuleChange,pdfSlot)',
            'V3 PDF slot propagation');
          code=exact(code,'<option value="pdf" disabled>PDF 原文</option>',
            '<option value="pdf">PDF 原文</option>',
            'V3 unsplit PDF option');
          code=exact(code,"    const split=document.createElement('label');split.className='ocr-preview-split-toggle';",
            "    mode.value='pdf';\n    const split=document.createElement('label');split.className='ocr-preview-split-toggle';",
            'V3 initial PDF mode');
          code=exact(code,"checkbox.type='checkbox';checkbox.checked=true;",
            "checkbox.type='checkbox';checkbox.checked=false;",
            'V3 initial unsplit preview');
          code=exact(code,`  setSplit(true);
  return Object.freeze({setSplit,activate(){if(container.clientWidth&&container.clientHeight)
    dockview.layout(container.clientWidth,container.clientHeight);},`,
            `  let sized=false;
  return Object.freeze({setSplit,activate(){
    if(!container.clientWidth||!container.clientHeight)return;
    dockview.layout(container.clientWidth,container.clientHeight);
    if(!sized){
      dockview.getPanel('preview')?.api.setSize({height:Math.round(container.clientHeight*2/3)});
      sized=true;
    }
  },`,
            'V3 initial three-pane 2/3 PDF height');
          code=exact(code,"element.append(area);\n    element.setAttribute('aria-label','Markdown 预览（空白）');",
            "const pdfTools=document.createElement('div');pdfTools.className='ocr-preview-mode-tools';pdfTools.dataset.mode='pdf';pdfTools.hidden=true;bar.append(pdfTools);\n"+
            "const pdfSurface=document.createElement('div');pdfSurface.className='ocr-preview-pdf-host';pdfSurface.dataset.pdfTheme='dark';\n"+
            "element.append(area,pdfSurface);owned=()=>mountV3PreviewSlot({pane:element,mdScroller:area,modeSelect:mode,pdfSurface,pdfTools,pdfSlot});\n"+
            "element.setAttribute('aria-label','Markdown / PDF 预览');",
            'V3 shared preview PDF slot');
          code=exact(code,"const host=document.createElement('div');host.className='ocr-detached-pdf-host';\n"+
            "    const surface=document.createElement('div');surface.className='ocr-preview-pdf-host';\n"+
            "    host.append(surface);element.append(host);",
            "const host=document.createElement('div');host.className='ocr-detached-pdf-host';\n"+
            "    const surface=document.createElement('div');surface.className='ocr-preview-pdf-host';\n"+
            "    host.append(surface);element.append(host);\n"+
            "    owned=()=>mountV3DetachedPDF({surface,actions,pdfSlot});",
            'V3 detached split PDF slot');
          code=exact(code,"picker.add(new Option('空白框架','frame'));",
            "picker.add(new Option('V3 工作台','frame'));",'V3 AG module title');
          code=exact(code,"picker.title='空白框架 AG 模块切换不可用';",
            "picker.title='V3 工作台模块 · 公共行索引与派生视图框架';",'V3 AG module tooltip');
          return exact(
            code,
            'return {dispose(){grid.destroy();},layout:()=>{}};',
            "grid.setGridOption('rowSelection',{mode:'singleRow',checkboxes:false,enableClickSelection:false});"+
            "host.v3GridPort=Object.freeze({"+
            "setColumns:(cols)=>{grid.setGridOption('columnDefs',cols);},"+
            "setRows:(rows)=>{grid.setGridOption('rowData',rows);},"+
            "getColumns:()=>grid.getColumnDefs(),"+
            "getColumnState:()=>grid.getColumnState(),"+
            "getFilterModel:()=>grid.getFilterModel(),"+
            "setFilterModel:(model)=>grid.setFilterModel(model),"+
            "getDisplayedRows:()=>{const rows=[];for(let i=0;i<grid.getDisplayedRowCount();i++)rows.push(grid.getDisplayedRowAtIndex(i)?.data);return rows;},"+
            "setRowHeight:(height)=>{if(grid.getGridOption('rowHeight')!==height){grid.setGridOption('rowHeight',height);grid.resetRowHeights();}},"+
            "setColumnWidths:(widths)=>{grid.setColumnWidths(widths);},"+
            "onColumnResized:(handler)=>{grid.addEventListener('columnResized',handler);return ()=>grid.removeEventListener('columnResized',handler);},"+
            "onRowClicked:(handler)=>{let lastAt=0,lastIdx=-1;const emit=(idx,data,node,ev)=>{const now=Date.now();if(idx===lastIdx&&now-lastAt<120)return;lastIdx=idx;lastAt=now;handler({data,node,rowIndex:idx,event:ev});};const onAg=(ev)=>{if(ev?.data)emit(ev.rowIndex??-1,ev.data,ev.node,ev.event);};const onDom=(ev)=>{const rowEl=ev.target?.closest?.('.ag-row[row-index]');if(!rowEl||!host.contains(rowEl))return;const idx=Number(rowEl.getAttribute('row-index'));if(!Number.isInteger(idx)||idx<0)return;const node=grid.getDisplayedRowAtIndex(idx);if(node?.data)emit(idx,node.data,node,ev);};grid.addEventListener('rowClicked',onAg);host.addEventListener('click',onDom);return ()=>{grid.removeEventListener('rowClicked',onAg);host.removeEventListener('click',onDom);};},"+
            "focusRow:(field,id)=>{let target=null;if(id!=null)grid.forEachNode(node=>{if(!target&&node.data?.[field]===id)target=node;});"+
            "if(!target){if(grid.getSelectedNodes().length)grid.deselectAll();return false;}"+
            "if(!target.isSelected())target.setSelected(true,true);"+
            "if(target.rowIndex==null)return false;grid.ensureIndexVisible(target.rowIndex,'auto');return true;}"+
            "});"+
            "document.dispatchEvent(new CustomEvent('v3-grid-ready',{detail:{host}}));"+
            "return {dispose(){delete host.v3GridPort;grid.destroy();},layout:()=>{}};",
            'V3 AG Grid data port',
          );
        }
        if(id.endsWith('/ui/frame/refresh.js')){
          return exact(code,"remote?.name==='lab-frame'","remote?.name==='lab-ocr-v3'",'V3 auto-update identity');
        }
      },
      generateBundle(){
        this.emitFile({
          type:'asset',
          fileName:'release-version.json',
          source:JSON.stringify({
            schema:'ocr2md-frame/v1',
            name,
            version,
            commit,
            frameBaseline,
            stage:'wp06-ag-dual-projection',
          })+'\n',
        });
      },
    },
  ],
});
