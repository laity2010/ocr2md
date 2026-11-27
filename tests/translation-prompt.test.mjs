import assert from 'node:assert/strict';
import test from 'node:test';
import {createPromptStorage,DEFAULT_PROMPT,PROMPT_KEY} from '../ui/translation/prompt-document.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
test('default contract and explicit local save preserve exact text',()=>{
 const storage=memory(),port=createPromptStorage(storage),first=port.read();
 assert.equal(first.stored,null);assert.equal(first.text,DEFAULT_PROMPT);
 for(const required of ['MDLine','Sentence','AI_ID','corrected','translated','target_language','source_line','sentence_index','保护占位符','不得重新分句'])assert(first.text.includes(required));
 assert.equal(storage.getItem(PROMPT_KEY),null);
 const text='任务书 😀\n\n';
 assert.deepEqual(port.save(text,first.stored),{text,stored:text});
 assert.equal(createPromptStorage(storage).read().text,text);
 assert.equal(port.save('',text).text,'');
 assert.equal(port.read().text,'');
});
test('stale draft never overwrites a more recent saved prompt; failures are explicit',()=>{
 const storage=memory(),a=createPromptStorage(storage),b=createPromptStorage(storage);
 const old=a.read();b.save('newer',null);
 assert.throws(()=>a.save('old editor',old.stored),/其他页面/);
 assert.equal(a.read().text,'newer');
 assert.throws(()=>a.save(null,'newer'),/文本/);
 assert.throws(()=>createPromptStorage({getItem:()=>null,setItem:()=>{throw Error('quota');}}).save('x',null),/quota/);
});
