/** Shared V6 build profile. No second application or copied core. */
import {existsSync, readFileSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';

const NAME=/^[a-z][a-z0-9-]{0,31}$/;
const slots=Object.freeze({
  chapterBoundary:{request:'./outline-grid.js',importers:['workspace.js','main.js']},
  chapterFiles:{request:'./chapter-files.js',importers:['outline-grid.js','main.js']},
  cmDocument:{request:'./cm-document.js',importers:['main.js']},
  media:{request:'./media-module.js',importers:['workspace.js','main.js']},
  latex:{request:'./latex-module.js',importers:['workspace.js','main.js']},
  settings:{request:'./settings-module.js',importers:['main.js']},
});
export function labProfile(root,name=process.env.V6_LAB_ID||''){
  if(!name)return null;
  if(!NAME.test(name))throw Error('Invalid V6_LAB_ID: use lowercase letters, digits and hyphens');
  const dir=join(root,'labs',name);
  const configPath=join(dir,'lab.json');
  const config=existsSync(configPath)?JSON.parse(readFileSync(configPath,'utf8')):{};
  if(Object.keys(config).some(k=>k!=='modules'))throw Error('Unknown lab config field');
  const replacements={};
  for(const [slot,path] of Object.entries(config.modules||{})){
    if(!slots[slot])throw Error('Unknown lab module slot: '+slot);
    if(typeof path!=='string'||!/^\.\/modules\/[\w-]+\.js$/.test(path))
      throw Error('Lab modules must be local ./modules/*.js files');
    const file=resolve(dir,path);
    if(!file.startsWith(dir+'/')||!existsSync(file))throw Error('Missing lab module: '+path);
    replacements[slot]=file;
  }
  return {name,dir,base:`/labs/${name}/`,replacements};
}

export function labVitePlugin(root,profile){
  if(!profile)return null;
  const sourceRoot=join(root,'ui');
  const scoped=profile.base;
  return {
    name:'v6-configured-lab',enforce:'pre',
    resolveId(source,importer){
      if(!importer)return;
      const sourceImporter=importer.split('?')[0].replaceAll('\\','/');
      for(const [slot,override] of Object.entries(profile.replacements)){
        const rule=slots[slot];
        if(source===rule.request&&rule.importers.some(file=>sourceImporter===join(sourceRoot,file)))
          return override;
      }
    },
    transform(code,id){
      const path=id.split('?')[0].replaceAll('\\','/');
      if(!path.startsWith(sourceRoot+'/'))return;
      if(path===join(sourceRoot,'media-module.js')){
        // Media thumbnails used to flash on every visit because activating
        // the pane destroyed visible row DOM (redrawRows), then repeated
        // inventory/status scans reassigned the same AG rowData. Inject this
        // small experiment-only adapter without forking the media module.
        const exact=(before,after)=>{
          if(!code.includes(before))throw Error('V6 Media preview adapter contract changed: '+before.slice(0,60));
          code=code.replace(before,after);
        };
        exact('  let localFiles=[],chapterReferences=new Set();',
          '  let localFiles=[],chapterReferences=new Set();\n  let lastRowSignature=null,lastPreviewSignature=null;');
        // The general Media inventory includes unused local files from other
        // chapters. In bounded chapter mode, AG must list ONLY items that
        // actually appear in the active chapter's Markdown (possibly zero).
        // Keep the old inventory UX for the mother/global view unchanged.
        exact('    for(const file of localFiles){',
          '    if(!new URLSearchParams(location.search).has(\'chapter\'))for(const file of localFiles){');
        // Local thumbnail links must stay under the isolated lab base. In
        // particular, do not request /media/* from the formal root service.
        exact("    const src='/'+(row.local?row.url:local||'');",
          `    const src='${scoped}'+(row.local?row.url:local||'');`);
        exact("    grid?.setGridOption('rowData',rows);",`    const rowSignature=JSON.stringify(rows.map(row=>[row.id,row.url,row.local,row.adopted,row.bytes,row.total]));
    const previewSignature=JSON.stringify(rows.map(row=>[row.id,stateFor(row.url).state==='complete'?stateFor(row.url).path||'':row.url]));
    if(rowSignature!==lastRowSignature){
      lastRowSignature=rowSignature;lastPreviewSignature=previewSignature;
      grid?.setGridOption('rowData',rows);
    }else if(previewSignature!==lastPreviewSignature){
      lastPreviewSignature=previewSignature;
      grid?.refreshCells({force:true,columns:['preview','status','action']});
    }else grid?.refreshCells({columns:['status','action']});`);
        exact('        grid?.redrawRows();',`        // Images rendered while the pane was hidden have no src. Arm only
        // those existing thumbnails, preserving loaded DOM/image state.
        for(const image of gridHost.querySelectorAll('.ocr-media-preview-link img.ocr-media-thumb:not([src])')){
          const address=image.closest('a')?.getAttribute('href');
          if(address)image.src=address;
        }`);
      }
      if(existsSync(join(profile.dir,'wp0-2','ag-query.js'))){
        if(path===join(sourceRoot,'media-module.js')){
          const needle='  return {\n    refresh,scan,downloadAll,';
          if(!code.includes(needle))throw Error('WP3 Media AG public adapter changed');
          code=code.replace(needle,'  return {\n    api:grid,\n    refresh,scan,downloadAll,');
        }
        if(path===join(sourceRoot,'latex-module.js')){
          const needle='  return {\n    refresh,\n    normalizeReviewed(){';
          if(!code.includes(needle))throw Error('WP3 LaTeX AG public adapter changed');
          code=code.replace(needle,'  return {\n    api:grid,\n    refresh,\n    normalizeReviewed(){');
        }
        if(path===join(sourceRoot,'workspace.js')){
          const needle='    this.latex=createLatexModule(this.latexHost,()=>getMarkdown(),()=>latexCMD,reportMediaStatus);';
          if(!code.includes(needle))throw Error('WP3 Workspace AG readiness contract changed');
          code=code.replace(needle,needle+`\n    setTimeout(()=>document.dispatchEvent(new CustomEvent('ocr2md:wp3-ag-ready',{detail:{\n      views:{outline:this.grid,media:this.media,latex:this.latex},getMarkdown:()=>getMarkdown(),\n    }})),0);`);
        }
      }
      if(path===join(sourceRoot,'workspace.js')){
        const layoutModule=join(profile.dir,'modules','layout-persistence.js');
        if(existsSync(layoutModule)){
          const marker='  dockview.onDidActivePanelChange(event => {';
          if(!code.includes(marker))throw Error('V6 core Workspace layout hook changed');
          code=`import {persistLabWorkspaceLayout} from ${JSON.stringify(layoutModule)};\n`+
            code.replace(marker,'  persistLabWorkspaceLayout(dockview,container);\n'+marker);
        }
      }
      if(path===join(sourceRoot,'main.js')){
        // Select the document as an explicit URL context, never a shared
        // mutable global server DOC. Every CM/AG/preview business path in
        // this page then uses exactly the same mainline workbench core.
        const sessionsModule=join(profile.dir,'modules','document-sessions.js');
        if(!existsSync(sessionsModule))throw Error('Missing lab file-session adapter');
        const helper = `let __labActiveChapter = new URLSearchParams(location.search).get('chapter');
const __labDocumentUrl = path => __labActiveChapter ? path + '?chapter=' + encodeURIComponent(__labActiveChapter) : path;
let __labSessions = null;
`;
        code=`import {createDocumentSessions} from ${JSON.stringify(sessionsModule)};\n`+code;
        const replaceOnce=(before,after)=>{
          if(!code.includes(before))throw Error('V6 core file session integration changed: '+before.slice(0,55));
          code=code.replace(before,after);
        };
        replaceOnce('const $ = (id) => document.getElementById(id);',helper+'const $ = (id) => document.getElementById(id);');
        replaceOnce("const documentLabel='Buffett’s Alpha.minerujson.md';",
          "let documentLabel=__labActiveChapter||'Buffett’s Alpha.minerujson.md';");
        replaceOnce("const hasUnsavedEdits = () => Boolean(view && savedDoc && !view.state.doc.eq(savedDoc));",
          "const hasUnsavedEdits = () => Boolean(view && savedDoc && !view.state.doc.eq(savedDoc));");
        replaceOnce("const snapshotDoc = view.state.doc;\n  const snapshot = snapshotDoc.toString();",
          "const snapshotDoc = view.state.doc;\n  const __labSavingFilename=__labActiveChapter;\n  const snapshot = snapshotDoc.toString();");
        replaceOnce('    savedDoc = snapshotDoc;\n    status(!hasUnsavedEdits()',
          '    savedDoc = snapshotDoc;\n    __labSessions?.markSaved(snapshotDoc,__labSavingFilename);\n    status(!hasUnsavedEdits()');
        replaceOnce('  savedDoc=view.state.doc;\n  workspace.refreshPreview();',`  savedDoc=view.state.doc;
  __labSessions=createDocumentSessions({
    cm,initialName:__labActiveChapter,initialSaved:savedDoc,
    fetchDocument:async name=>{
      const path=name?'${scoped}api/document?chapter='+encodeURIComponent(name):'${scoped}api/document';
      const res=await fetch(path,{cache:'no-store'});
      if(!res.ok)throw Error('文件读取失败 HTTP '+res.status);
      return res.text();
    },
    onActivated:({name,saved})=>{
      __labActiveChapter=name;
      savedDoc=saved;
      documentLabel=name||'Buffett’s Alpha.minerujson.md';
      // Clear cross-file selection/focus while retaining global module layout.
      viewStore.setState({focusTarget:null,scrollTarget:null,sourceOffset:0,outlineCount:null});
      documentChanged();
      workspace.refreshPreview();workspace.refreshOutline();workspace.refreshPdf();
      documentLines=null;documentChars=null;
      refreshToolbar();renderGlobalStatus();
    },
  });
  document.addEventListener('ocr2md:lab-switch-file',event=>{
    const detail=event.detail;
    detail.promise=(async()=>{
      if(saving||exporting||initializing||pendingUpdate||$('unlock-dialog').open || $('initialize-dialog').open)
        throw Error('正在保存或操作中，无法切换文件');
      const changed=await __labSessions.switchTo(detail.chapter);
      if(!changed)throw Error('文件切换正在进行，请重试');
      if($('module-select').value==='settings'){
        $('module-select').value='chapter-boundary';
        $('module-select').dispatchEvent(new Event('change',{bubbles:true}));
      }
      const url=new URL(location.href);
      if(detail.chapter)url.searchParams.set('chapter',detail.chapter);
      else url.searchParams.delete('chapter');
      if(detail.updateHistory!==false)window.history.pushState(null,'',url.pathname+url.search+url.hash);
      document.dispatchEvent(new CustomEvent('ocr2md:lab-file-activated',{detail:{chapter:detail.chapter}}));
      // Refresh all three existing element projections from the new CM6 file
      // even if the user currently displays only one AG category.
      if(detail.chapter){
        workspace.refreshOutline();
        void workspace.scanMedia();
        workspace.scanLatex();
      }
      status('✓ 已切换文件');
      return true;
    })();
  });
  window.addEventListener('popstate',()=>{
    // History navigation follows the same in-place document switching path.
    const chapter=new URLSearchParams(location.search).get('chapter');
    if(chapter===__labActiveChapter)return;
    const detail={chapter,promise:null,updateHistory:false};
    document.dispatchEvent(new CustomEvent('ocr2md:lab-switch-file',{detail}));
    detail.promise?.catch(error=>status('导航失败：'+error.message,'error'));
  });
  workspace.refreshPreview();`);
        replaceOnce("if (hasUnsavedEdits() || settings?.hasUnsaved() || buttons.save.disabled || exporting || initializing ||",
          "if (hasUnsavedEdits() || __labSessions?.hasOtherUnsaved() || settings?.hasUnsaved() || buttons.save.disabled || exporting || initializing ||");
        replaceOnce("if ((hasUnsavedEdits()||settings?.hasUnsaved())&&!allowInitializeReload)",
          "if ((hasUnsavedEdits()||__labSessions?.hasOtherUnsaved()||settings?.hasUnsaved())&&!allowInitializeReload)");
        for(const endpoint of ['document','export-chapters','initialize-document'])
          code=code.replaceAll(`fetch('/api/${endpoint}'`,`fetch(__labDocumentUrl('/api/${endpoint}')`);
        const wp4=join(profile.dir,'wp0-2','cm-virtual-view.js');
        if(existsSync(wp4)){
          code=`import {virtualChapterExtensions,setVirtualChapter} from ${JSON.stringify(wp4)};\n`+code;
          replaceOnce('    extensions:[','    extensions:[\n      ...virtualChapterExtensions,');
          replaceOnce('  view=cm.view;','  view=cm.view;\n  document.addEventListener(\'ocr2md:wp4-virtual-scope\',event=>{\n    const scope=event.detail?.scope??null;\n    try{setVirtualChapter(view,scope);}catch(error){\n      status(\'章节视图失败：\'+error.message,\'error\');\n    }\n  });');
        }
      }

      // Scope only the reused mainline's network requests; fail-closed browser
      // acceptance checks reject any unprefixed /api or /media request.
      return code.replaceAll("'/api/",`'${scoped}api/`)
        .replaceAll('"/api/',`"${scoped}api/`)
        .replaceAll("'/media/",`'${scoped}media/`)
        .replaceAll('"/media/',`"${scoped}media/`)
        .replaceAll("'/healthz'",`'${scoped}healthz'`)
        .replaceAll('"/healthz"',`"${scoped}healthz"`);
    },
    transformIndexHtml(html){
      // The compact build badge already distinguishes lab from main.
      return html;
    },
  };
}
