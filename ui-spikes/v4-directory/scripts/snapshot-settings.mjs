/** Historic V3 24-field reference snapshot for future module migration only.
 * NEVER replace the live V4 settings UI schema or its 5-field model.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
const root=resolve('ui-spikes/v4-directory');
const input=resolve(root,'migration-reference/settings-model-v3.ts');
const result=await build({entryPoints:[input],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false});
await writeFile(resolve(root,'migration-reference/settings-model-v3.js'),result.outputFiles[0].text);
const generated=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const rows=(await readFile('ui-spikes/v3-directory/src/v2SettingsAdapter.ts','utf8'))
  .matchAll(/^\s*(\w+):\s*\{group:\s*"([^"]+)",\s*description:\s*"([^"]+)"\}/gm);
const details=new Map(Array.from(rows,([,key,group,description])=>[key,{group,description}]));
const schema=Object.entries(generated.DEFAULT_DIRECTORY_SETTINGS).map(([id,value])=>{
  const info=details.get(id);
  if(!info)throw Error('Missing V3 setting details: '+id);
  const type=Array.isArray(value)?'array':value!==null&&typeof value==='object'?'object':
    typeof value==='boolean'?'boolean':typeof value==='number'?(Number.isInteger(value)?'integer':'number'):'string';
  const control=info.group.includes('MD ')||info.group.includes('AG 表')||
    info.group.includes('PDF ')||info.group.includes('统一源码')||
    info.group.includes('AG＋源码')?'工作台':'工作目录';
  return {id,label:id,theme:'ocr2md',category:info.group,group:control,
    description:info.description,type,...(['array','object'].includes(type)?{editor:'source'}:{}),
    defaultValue:value,readOnly:false};
});
await writeFile(resolve(root,'migration-reference/settings.schema.v3.json'),JSON.stringify(schema,null,2)+'\n');
console.log('OCR2MD_V3_MIGRATION_REFERENCE_SNAPSHOT',schema.length);
