/** WP1 pure semantics: Main-style PDF bbox/label drop, stable BlockIDs. */
import assert from 'node:assert/strict';
import {blockDropPlacements,pickBlockDropTarget,blockDropZone} from '../ui/lab-ocr/pdf-block-drop.js';
const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const source={blockId:'10',parentBlockId:null,page:1};
const parent={blockId:'20',parentBlockId:null,page:1,pbs:'p1b1',
  badgeRect:rect(400,60,40,23),coverRect:rect(300,90,150,150)};
const child={blockId:'21',parentBlockId:'20',page:1,pbs:'p1b1s0',
  badgeRect:rect(451,95,52,23),coverRect:rect(320,100,30,40)};
const otherPage={...parent,blockId:'30',page:2};
assert.deepEqual(blockDropPlacements(source,parent),['before','child','after']);
assert.deepEqual(blockDropPlacements(source,child),['child']);
assert.deepEqual(blockDropPlacements({blockId:'22',parentBlockId:'20',page:1},child),['before','after']);
assert.deepEqual(blockDropPlacements({blockId:'22',parentBlockId:'30',page:1},child),[]);
assert.deepEqual(blockDropPlacements(source,otherPage),[]);
assert.deepEqual(blockDropPlacements(source,source),[]);
const clip=rect(0,0,600,440);
assert.equal(pickBlockDropTarget([parent,child],{x:336,y:119,source,clip}).blockId,'21',
  'Deepest physical bbox wins');
assert.equal(pickBlockDropTarget([parent,child],{x:400,y:135,source,clip}).blockId,'20');
assert.equal(pickBlockDropTarget([parent,child],{x:458,y:109,source,clip}).blockId,'21',
  'Explicit nonoverlapping outboard PBS chip is an unambiguous target');
assert.equal(pickBlockDropTarget([parent],{x:601,y:109,source,clip}),null);
assert.equal(pickBlockDropTarget([parent],{x:400,y:110,source:parent,clip}),null);
assert.equal(pickBlockDropTarget([otherPage],{x:400,y:110,source,clip}),null);
const guide=rect(100,40,210,30);
assert.equal(blockDropZone(110,guide,['before','child','after']),'before');
assert.equal(blockDropZone(205,guide,['before','child','after']),'child');
assert.equal(blockDropZone(300,guide,['before','child','after']),'after');
assert.equal(blockDropZone(220,guide,['before','after']),'after');
console.log('LAB_OCR_PDF_BLOCK_DROP_PASS');
