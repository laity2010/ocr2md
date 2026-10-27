/** Shared V6 build profile. No second application or copied core. */
import {existsSync, readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

const NAME=/^[a-z][a-z0-9-]{0,31}$/;
const slots=Object.freeze({
  chapterBoundary:{request:'./outline-grid.js',importers:['workspace.js','main.js']},
  chapterFiles:{request:'./chapter-files.js',importers:['outline-grid.js','main.js']},
  cmDocument:{request:'./cm-document.js',importers:['main.js']},
  media:{request:'./media-module.js',importers:['workspace.js','main.js']},
  latex:{request:'./latex-module.js',importers:['workspace.js','main.js']},
  settings:{request:'./settings-module.js',importers:['main.js']},
  wcpRuntime:{request:'./wcp-runtime.js',importers:['main.js']},
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
    transformIndexHtml(html){
      // The compact build badge already distinguishes lab from main.
      return html;
    },
  };
}
