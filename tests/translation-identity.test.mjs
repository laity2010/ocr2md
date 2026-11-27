import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import config from '../labs/lab-translation/vite.config.mjs';
const plugin=config.plugins.find(p=>p.name==='translation-frame-identity');
test('translation build scopes F03 update to this state only',async()=>{
  const path=new URL('../ui/frame/refresh.js',import.meta.url);
  const text=await readFile(path,'utf8');
  const module=await import('data:text/javascript;base64,'+Buffer.from(plugin.transform(text,path.pathname)).toString('base64'));
  const remote={schema:'ocr2md-frame/v1',name:'lab-translation',version:'v2'};
  assert.equal(module.shouldReload('v1',remote),true);
  assert.equal(module.shouldReload('v2',remote),false);
  for(const name of ['lab-frame','translation-lab','lab-sentence','lab-ocr-v2'])assert.equal(module.shouldReload('v1',{...remote,name}),false);
  assert.throws(()=>plugin.transform('changed',path.pathname),/contract changed/);
});
