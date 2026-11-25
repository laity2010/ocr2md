/** Independent, DATALESS frame showcase. Main's application entry is untouched.
 * This is not a replacement for the identical-module-graph mirror Lab build. */
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../ui/frame/',import.meta.url));
// No private full Sarasa copies: Frame uses Agent Link's shared immutable face.
const publicDir=false;
const outDir=fileURLToPath(new URL('./dist/',import.meta.url));
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const now=new Date();
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
const p=k=>parts.find(x=>x.type===k).value;
const version=`lab-sentence-${p('year')}${p('month')}${p('day')}-${p('hour')}${p('minute')}${p('second')}`;
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
  root,publicDir,base:'/labs/lab-sentence/',
  define:{__FRAME_BUILD_VERSION__:JSON.stringify(version),__FRAME_SOURCE_COMMIT__:JSON.stringify(sha)},
  build:{outDir,emptyOutDir:true},
  plugins:[federalBuildRegistration,{name:"sentence-frame-identity",enforce:"pre",
  transform(code,id){
    if(id.endsWith("/ui/frame/frame.js")){
      const old="createFrameSettingsIO(localStorage,'lab-frame'";
      if(!code.includes(old))throw Error("Frame settings signature changed");
      const source=code.replace(old,"createFrameSettingsIO(localStorage,'lab-sentence'");
      const probe="await frameWorkspaceIO.probe(selected);";
      if(!source.includes(probe))throw Error("Frame F02 signature changed");
      return "import {createSentenceReview} from '../sentence/review.js';\n"+source
        .replace("let settings=null,loadingSettings=null,currentModule='frame';","let settings=null,loadingSettings=null,currentModule='frame';\nconst sentenceReview=createSentenceReview({report:topStatus,showFrame:()=>showModule('frame')});")
        .replace("if(!selected){","if(!selected){\n    if(!uncommitted)sentenceReview.clear();")
        .replace(probe,probe)
        .replace("(afterSave?'✓ 全局设置已保存 · ':'✓ ')+'工作区文件可读写'+(uncommitted?' · 目录设置尚未保存':''),'ok');","(afterSave?'✓ 全局设置已保存 · ':'✓ ')+'工作区文件可读写'+(uncommitted?' · 目录设置尚未保存':''),'ok');\n    if(generation===probeGeneration&&!uncommitted)void sentenceReview.load(selected).catch(error=>topStatus('逻辑表接入失败：'+error.message,'error'));")
        .replace("}catch(error){\n    if(generation===probeGeneration)topStatus(","}catch(error){\n    if(generation===probeGeneration&&!uncommitted)sentenceReview.clear();\n    if(generation===probeGeneration)topStatus(");
    }
    if(id.endsWith("/ui/frame/layout.js")){
      const exact=(a,b)=>{if(code.split(a).length!==2)throw Error("Sentence Frame contract drift: "+a);code=code.replace(a,b);};
      exact("import {EditorState} from '@codemirror/state';","import {EditorState} from '@codemirror/state';\nimport {mountSentenceSource} from '../sentence/source.js';\nimport {mountV2PreviewSlot,mountV2DetachedPDF} from '../v2-preview-slot.js';");
      exact("element.append(body);owned=()=>mountEmptySource(body);","element.append(body);owned=()=>mountSentenceSource(body);");
      exact("function blankPane(name,onSplit,onModuleChange){","function blankPane(name,onSplit,onModuleChange,pdfSlot){");
      exact("  let split=false;\n  const dockview=createDockview","  let split=false;\n  const pdfSlot={preview:null,detached:null,current:null};\n  const dockview=createDockview");
      exact("blankPane(name,setSplit,onModuleChange)","blankPane(name,setSplit,onModuleChange,pdfSlot)");
      exact('<option value="pdf" disabled>PDF 原文</option>','<option value="pdf">PDF 原文</option>');
      exact("element.append(area);\n    element.setAttribute('aria-label','Markdown 预览（空白）');","const pdfTools=document.createElement('div');pdfTools.className='ocr-preview-mode-tools';pdfTools.dataset.mode='pdf';pdfTools.hidden=true;bar.append(pdfTools);\nconst pdfSurface=document.createElement('div');pdfSurface.className='ocr-preview-pdf-host';pdfSurface.dataset.pdfTheme='dark';\nelement.append(area,pdfSurface);owned=()=>mountV2PreviewSlot({pane:element,mdScroller:area,modeSelect:mode,pdfSurface,pdfTools,pdfSlot});\nelement.setAttribute('aria-label','Markdown / PDF 预览');");
      exact("host.append(surface);element.append(host);","host.append(surface);element.append(host);owned=()=>mountV2DetachedPDF({surface,actions,pdfSlot});");
      exact("return {dispose(){grid.destroy();},layout:()=>{}};","grid.setGridOption('rowSelection',{mode:'singleRow',checkboxes:false,enableClickSelection:false});host.sentenceGridPort=Object.freeze({setColumns:columns=>grid.setGridOption('columnDefs',columns),setRows:rows=>grid.setGridOption('rowData',rows),getColumns:()=>grid.getColumnDefs(),getDisplayedRows:()=>Array.from({length:grid.getDisplayedRowCount()},(_,i)=>grid.getDisplayedRowAtIndex(i).data),onRowClicked:fn=>grid.addEventListener('rowClicked',fn),focusRow:id=>{let target=null;grid.forEachNode(node=>{if(node.data?.logical_id===id)target=node;});if(!target){grid.deselectAll();return false;}target.setSelected(true,true);if(target.rowIndex!=null)grid.ensureIndexVisible(target.rowIndex,'auto');return true;}});return {dispose(){delete host.sentenceGridPort;grid.destroy();},layout:()=>{}};");
      return code;
    }
    if(id.endsWith("/ui/frame/refresh.js")){
      const old="remote?.name==='lab-frame'";
      if(!code.includes(old))throw Error("Frame refresh signature changed");
      return code.replace(old,"remote?.name==='lab-sentence'");
    }
  },
  transformIndexHtml(html){return html.replace("OCR2MD V6 · Lab Frame","OCR2MD · Lab Sentence").replace("OCR2MD lab-frame","OCR2MD lab-sentence");}
}, {name:'frame-release-version',generateBundle(){this.emitFile({type:'asset',fileName:'release-version.json',source:JSON.stringify({schema:'ocr2md-frame/v1',name:'lab-sentence',version,commit:sha})+'\n'});}}],
});
