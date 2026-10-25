/** Shared V6 build profile. No second application or copied core. */
import {existsSync, readFileSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';

const NAME=/^[a-z][a-z0-9-]{0,31}$/;
const slots=Object.freeze({
  chapterBoundary:{request:'./outline-grid.js',importers:['workspace.js','main.js']},
  chapterFiles:{request:'./chapter-files.js',importers:['outline-grid.js','main.js']},
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
        const helper = `const __labActiveChapter = new URLSearchParams(location.search).get('chapter');
const __labDocumentUrl = path => __labActiveChapter ? path + '?chapter=' + encodeURIComponent(__labActiveChapter) : path;
`;
        code=code.replace('const $ = (id) => document.getElementById(id);',helper+'const $ = (id) => document.getElementById(id);');
        for(const endpoint of ['document','export-chapters','initialize-document'])
          code=code.replaceAll(`fetch('/api/${endpoint}'`,`fetch(__labDocumentUrl('/api/${endpoint}')`);
        code=code.replace("const documentLabel='Buffett’s Alpha.minerujson.md';",
          "const documentLabel=__labActiveChapter||'Buffett’s Alpha.minerujson.md';");
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
      return html.replace('<div class="brand">OCR2MD V6</div>',
        `<div class="brand">OCR2MD V6 · 实验 ${profile.name}</div>`);
    },
  };
}
