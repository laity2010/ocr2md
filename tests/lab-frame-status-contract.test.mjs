/** Shell status API: no module writes directly to the global status DOM. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFrameStatus} from '../ui/frame/global-status.js';

const host={
  attrs:{},dataset:{},textContent:'',
  setAttribute(name,value){this.attrs[name]=value;},
};
const status=createFrameStatus(host);
for(const [level,text] of [
  ['info','正在读取目录'],['ok','目录已同步'],['warning','目录已变化'],
  ['error','目录刷新失败：服务器目录接口 422'],
]){
  status.publish(text,level);
  assert.equal(host.dataset.kind,level);
  assert.equal(host.textContent,text);
}
assert.equal(host.attrs['aria-live'],'polite');
assert.equal(host.attrs.role,'status');
const dir=readFileSync(new URL('../ui/wcp-workspace-directory-module.js',import.meta.url),'utf8');
assert.ok(dir.includes('onStatus(message,level)'), 'Directory publishes into injected Shell API');
assert.ok(!dir.includes('ocr-settings-directory-picker-message'),
  'Directory must not render a private status display');
for(const level of ['info','ok','warning','error']){
  const css=readFileSync(new URL('../ui/frame/frame.css',import.meta.url),'utf8');
  assert.ok(css.includes('#status[data-kind="'+level+'"]'),
    'Shell must color every supported severity');
}
console.log('FRAME_GLOBAL_STATUS_CONTRACT_PASS');
