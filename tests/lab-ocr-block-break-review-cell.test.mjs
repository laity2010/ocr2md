/** Independent public component contract; no browser, SQL, AG instance. */
import assert from 'node:assert/strict';
import {createBlockBreakReviewCell,REVIEW_DECISIONS} from '../ui/lab-ocr/block-break-review-cell.js';
const saved={document:globalThis.document,innerWidth:globalThis.innerWidth,
  innerHeight:globalThis.innerHeight};
class MockNode{
  constructor(tag){this.tag=tag;this.children=[];this.listeners=new Map();
    this.attributes={};this.dataset={};this.style={};this.className='';this.textContent='';}
  append(...nodes){this.children.push(...nodes);}
  remove(){this.removed=true;}
  addEventListener(name,fn){this.listeners.set(name,fn);}
  removeEventListener(name){this.listeners.delete(name);}
  setAttribute(name,value){this.attributes[name]=value;}
  getBoundingClientRect(){return {left:22,top:25,bottom:63};}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  emit(name){this.listeners.get(name)?.({preventDefault(){},stopPropagation(){},target:this});}
}
try{
 const body=new MockNode('body');
 globalThis.document={body,createElement:tag=>new MockNode(tag),
   addEventListener(){},removeEventListener(){}};
 globalThis.innerWidth=1200;globalThis.innerHeight=700;
 const actions=[];const renderer=createBlockBreakReviewCell(async(row,decision)=>{
   actions.push([row.issue_id,decision]);});
 assert.deepEqual(REVIEW_DECISIONS,['待定','断块合并','忽略']);
 const cell=renderer({data:{issue_id:'block-break:2:3',review:'待定',
   before_pbs:'p2b0',after_pbs:'p2b0s0'}});
 const button=cell.children[0];
 assert.equal(button.dataset.review,'待定');
 assert.equal(button.attributes['aria-haspopup'],'listbox');
 button.emit('click');
 const menu=body.children.at(-1);
 assert.equal(menu.attributes.role,'listbox');
 assert.deepEqual(menu.children.map(option=>option.dataset.review),REVIEW_DECISIONS);
 assert.equal(menu.children[1].textContent,'断块合并（仅记录）');
 assert.equal(menu.children[1].attributes['aria-selected'],'false');
 menu.children[1].emit('click');
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(actions,[['block-break:2:3','断块合并']]);
 assert.equal(menu.removed,true);
 assert.equal(button.attributes['aria-expanded'],'false');
 const reviewed=renderer({data:{review:'断块合并'}});
 reviewed.children[0].emit('click');
 const nextMenu=body.children.at(-1);
 nextMenu.children[1].emit('click');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(actions.length,1,'selecting the existing decision is a no-op');
 console.log('LAB_OCR_BLOCK_BREAK_REVIEW_CELL_DIRECT_PASS');
}finally{
 globalThis.document=saved.document;globalThis.innerWidth=saved.innerWidth;
 globalThis.innerHeight=saved.innerHeight;
}
