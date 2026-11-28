import assert from 'node:assert/strict';
import test from 'node:test';
import {createPromptStorage,DEFAULT_PROMPT,PROMPT_KEY,createPromptParameters,copyPromptText} from '../ui/translation/prompt-document.js';
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


test('runtime parameter values follow the current export; no claim of filesystem writes',()=>{
 const a={text:JSON.stringify({schema:'ocr2md-trans/v1',task_id:'T1',source_sha256:'S1',sentence_sha256:'Q1',target_language:'zh-CN'}),count:7};
 const b={text:JSON.stringify({schema:'ocr2md-trans/v1',task_id:'T2',source_sha256:'S2',sentence_sha256:'Q2',target_language:'ja'}),count:9};
 const first=createPromptParameters(a,'/books/中文 A/');
 assert(first.includes('input_json: "/books/中文 A/trans/sentences.json"'));
 assert(first.includes('result_json: "/books/中文 A/trans/AI_ID.json"'));
 assert(first.includes('target_language: "zh-CN"'));assert(first.includes('task_id: "T1"'));assert(first.includes('sentence_count: 7'));assert(first.includes('尚未核验'));assert(createPromptParameters(a,'/books/中文 A/',true).includes('回读验证一致'));
 const next=createPromptParameters(b,'/books/B');
 assert(next.includes('target_language: "ja"'));assert(next.includes('task_id: "T2"'));assert(!next.includes('T1'));assert(!next.includes('中文 A'));
 const empty=createPromptParameters(null,'');assert(empty.includes('尚无有效译句表'));assert(!empty.includes('input_json:'));
 const storage=memory(),port=createPromptStorage(storage);port.save('用户自定义任务书',null);
 createPromptParameters(a,'/books/A');assert.equal(port.read().text,'用户自定义任务书');
});


test('copy full live prompt exactly; missing or rejected clipboard fails explicitly',async()=>{
 const text='未保存正文 😀\n\n- input_json: "/book/trans/sentences.json"\n';
 let copied=null;await copyPromptText(text,{writeText(value){copied=value;return Promise.resolve();}});
 assert.equal(copied,text);
 await assert.rejects(copyPromptText(text,{}),/剪贴板不可用/);
 await assert.rejects(copyPromptText(text,{writeText(){return Promise.reject(Error('denied'));}}),/denied/);
 await assert.rejects(copyPromptText('',{writeText(){throw Error('must not write');}}),/没有可复制/);
});
