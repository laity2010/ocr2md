import assert from 'node:assert/strict';
import test from 'node:test';
import {createFrameSettings,FONT_FAMILY_KEY,FONT_SIZE_KEY} from '../ui/frame/settings.js';
const fake=seed=>{
  const map=new Map(seed);
  const vars=new Map();
  const storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};
  const root={style:{setProperty:(key,value)=>vars.set(key,value)}};
  return {map,vars,storage,root};
};

test('F05 registers immutable Sarasa font and 16px global default',()=>{
  const p=fake();const s=createFrameSettings(p);
  assert.deepEqual(s.list().map(x=>[x.key,x.value,x.readonly]),[
    [FONT_FAMILY_KEY,'Sarasa',true],[FONT_SIZE_KEY,16,false]]);
  assert.equal(s.selected,FONT_SIZE_KEY);
  assert.equal(p.vars.get('--ocr-frame-font-size'),'16px');
  assert.equal(p.vars.get('--ocr-frame-scale'),'1');
  assert.throws(()=>s.set(FONT_FAMILY_KEY,'Arial'),/只读/);
  assert.throws(()=>s.register({key:FONT_FAMILY_KEY,control:'readonly',category:['全局 UI','字体'],label:'字体',defaultValue:'Arial'}),/重复/);
  assert.equal(s.get(FONT_FAMILY_KEY),'Sarasa');
  assert.equal(s.snapshot().settings[FONT_FAMILY_KEY].readonly,true);
  s.dispose();
});

test('F05 validates range, emits changes, locally persists only font size',()=>{
  const p=fake();const messages=[];
  const s=createFrameSettings({...p,onStatus:(...args)=>messages.push(args)});
  let changes=0;const unsubscribe=s.subscribe(()=>changes++);
  for(const bad of [0,7,33,16.5,'24',NaN,Infinity])
    assert.throws(()=>s.set(FONT_SIZE_KEY,bad),/范围/);
  assert.equal(s.set(FONT_SIZE_KEY,24),true);
  assert.equal(s.set(FONT_SIZE_KEY,24),false);
  assert.equal(changes,1);
  assert.equal(p.vars.get('--ocr-frame-font-size'),'24px');
  assert.equal(p.vars.get('--ocr-frame-scale'),'1.5');
  assert.equal(p.map.get('ocr2md.lab-frame.font-size.v1'),'24');
  assert.equal(p.map.size,1);
  assert.match(messages[0][0],/Sarasa.*24 px/);
  s.select(FONT_FAMILY_KEY);assert.equal(changes,2);
  assert.throws(()=>s.select('invalid'),/未知/);
  unsubscribe();s.dispose();
  const restored=createFrameSettings(p);
  assert.equal(restored.get(FONT_SIZE_KEY),24);
  assert.equal(restored.get(FONT_FAMILY_KEY),'Sarasa');
});

test('F05 corrupted/unavailable local preferences fail closed to 16',()=>{
  for(const stored of ['bad','33','-1','16.5','']){
    const p=fake([['ocr2md.lab-frame.font-size.v1',stored]]);
    const s=createFrameSettings(p);assert.equal(s.get(FONT_SIZE_KEY),16);
    s.dispose();
  }
  const p=fake();
  p.storage.getItem=()=>{throw Error('storage denied');};
  p.storage.setItem=()=>{throw Error('storage denied');};
  const reported=[];
  const s=createFrameSettings({...p,onStatus:(...args)=>reported.push(args)});
  assert.equal(s.get(FONT_SIZE_KEY),16);
  assert.equal(s.set(FONT_SIZE_KEY,20),true);
  assert.equal(p.vars.get('--ocr-frame-font-size'),'20px');
  assert.equal(reported[0][1],'warning');
  assert.equal(reported.at(-1)[1],'ok');
});
