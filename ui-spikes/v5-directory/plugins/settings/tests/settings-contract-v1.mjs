import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createSettingsModel} from '../ui-settings-model.js';
const root=resolve(import.meta.dirname,'../../..');
const own=JSON.parse(await readFile(resolve(root,'plugins/settings/settings.schema.json'),'utf8'));
assert.equal(own.length,5);
assert(own.every(x=>x.component==='通用设置 UI'));
const fake={ownerId:'ocr2md:test-fixture',schema:[
 {id:'fixtureEnabled',label:'Fixture 开关',type:'boolean',defaultValue:false,component:'测试模块'},
 {id:'fixtureCount',label:'Fixture 数量',type:'integer',min:1,max:9,defaultValue:3,component:'测试模块'},
 {id:'fixtureText',label:'Fixture 文本',type:'string',pattern:'^[a-z]+$',defaultValue:'hello',component:'测试模块'},
]};
const original=await readFile(resolve(root,'plugins/settings/settings.js'));
const model=createSettingsModel(own,[fake]);
assert.equal(model.schema.length,8);
assert.deepEqual(model.forOwner(fake.ownerId,model.defaults),{fixtureEnabled:false,fixtureCount:3,fixtureText:'hello'});
assert.deepEqual(model.forOwner('ocr2md:unused',model.defaults),{});
const changed=model.validate({...model.defaults,fixtureEnabled:true,fixtureCount:7,fixtureText:'changed'},{strict:true});
assert.deepEqual(model.byOwner(changed),[{ownerId:fake.ownerId,values:{fixtureEnabled:true,fixtureCount:7,fixtureText:'changed'}}]);
for(const entry of [{fixtureCount:10},{fixtureCount:0},{fixtureText:'bad value'},{fixtureEnabled:'true'}])
 assert.throws(()=>model.validate({...model.defaults,...entry},{strict:true}));
assert.throws(()=>model.validate({...model.defaults,unregisteredSetting:true},{strict:true}));
assert.throws(()=>createSettingsModel(own,[{ownerId:fake.ownerId,schema:[{...fake.schema[0],id:'sourceFontSize'}]}]));
assert.equal(model.fromStored({fixtureEnabled:true,fixtureCount:999,chapterAgFontSize:17}).fixtureCount,3);
assert.equal(model.forOwner(fake.ownerId,model.fromStored({fixtureEnabled:true})).fixtureEnabled,true);
assert.deepEqual(await readFile(resolve(root,'plugins/settings/settings.js')),original,
 'Adding three settings by public registration must never mutate Settings source');
console.log('SETTINGS_CONTRACT_V1_GENERIC_3_TYPES_PASS');
