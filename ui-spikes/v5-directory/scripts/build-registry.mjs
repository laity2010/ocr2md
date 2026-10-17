/** Deterministic opt-in discovery; each plugin owns its own manifest and implementation. */
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(process.env.V5_PLUGIN_ROOT||resolve(new URL('../plugins/',import.meta.url).pathname));
const dirs=(await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort();
const list=[];
for(const directory of dirs){
 const path=join(root,directory,'plugin.json');let descriptor;
 try{descriptor=JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code==='ENOENT')continue;throw e}
 const {schemaVersion,id,entry,kind,tab,home=false,prewarm=false,order=100,actions=[],activateOn="",tabGroup="",hiddenTab=false,toolbarTitleVisible=true,enabled=true}=descriptor;
 if(enabled===false)continue;
 if(schemaVersion!==1||!/^ocr2md:[a-z][a-z0-9-]*$/.test(id)||!['ui','service'].includes(kind)||entry!=='index.js'||
   (kind==='ui'&&typeof tab!=='string')||(kind==='service'&&(tab||home||prewarm))||
   typeof home!=='boolean'||typeof prewarm!=='boolean'||typeof hiddenTab!=='boolean'||typeof toolbarTitleVisible!=='boolean'||(tabGroup!==''&&!/^[a-z][a-z0-9-]*$/.test(tabGroup))||!Number.isInteger(order)|| (activateOn!==''&&!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(activateOn))||!Array.isArray(actions)||actions.some(a=>!/^[-a-z0-9]+$/.test(a.id)||typeof a.label!=='string'||(a.globalRole!==undefined&&!['undo','redo','save'].includes(a.globalRole))) )throw Error('PLUGIN_DESCRIPTOR_INVALID '+directory);
 if(list.some(x=>x.id===id))throw Error('PLUGIN_DUPLICATE_ID '+id);
 await readFile(join(root,directory,entry));
 list.push({directory,id,kind,tab,home,prewarm,order,actions,activateOn,tabGroup,hiddenTab,toolbarTitleVisible});
}
if(list.filter(x=>x.home).length!==1||list.filter(x=>x.kind==='ui').length<1)throw Error('PLUGIN_HOME_INVALID');
list.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
const imports=list.map((x,i)=>`import * as plugin${i} from './${x.directory}/index.js';`).join('\n');
const result=imports+'\nexport const plugins=[\n'+list.map((x,i)=>`  Object.freeze({...plugin${i},manifest:Object.freeze(${JSON.stringify(x)})})`).join(',\n')+'\n];\n';
await writeFile(join(root,'registry.generated.js'),result);
console.log('V5_PLUGINS_DISCOVERED',JSON.stringify(list.map(x=>x.id)));
