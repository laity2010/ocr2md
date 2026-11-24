import assert from 'node:assert/strict';
import {effectiveBlockType} from '../ui/v2-live-block-type.js';
for(let level=1;level<=6;level++){
  const text='#'.repeat(level)+' Heading';
  assert.equal(effectiveBlockType('text',text),'title');
  assert.equal(effectiveBlockType('title',text),'title');
}
for(const text of ['Text','', '#NoSpace','####### Invalid','paragraph # heading']){
  assert.equal(effectiveBlockType('title',text),'text');
  assert.equal(effectiveBlockType('text',text),'text');
}
for(const type of ['interline_equation','table','image','table_body','table_caption','discarded']){
  assert.equal(effectiveBlockType(type,'ordinary content'),type);
}
console.log('WP23C_LIVE_BLOCK_TYPE_PASS');
