import assert from 'node:assert/strict';
import {blockRevealScrollDelta} from '../ui/lab-ocr/pdf-gesture-viewport.js';
const view={left:100,top:200,right:600,bottom:700};
const rect=(l,t,r,b)=>({left:l,top:t,right:r,bottom:b});
assert.deepEqual(blockRevealScrollDelta(rect(180,250,310,410),view),{x:0,y:0},'Already fully visible: no jump');
assert.deepEqual(blockRevealScrollDelta(rect(180,50,310,100),view),{x:0,y:-160},'Above visible scrollport');
assert.deepEqual(blockRevealScrollDelta(rect(180,650,310,780),view),{x:0,y:90},'Below viewport');
assert.deepEqual(blockRevealScrollDelta(rect(20,240,70,430),view),{x:-90,y:0},'Horizontally outside');
assert.deepEqual(blockRevealScrollDelta(rect(210,240,708,430),view),{x:109,y:0},
 'Near full-width block must fit by shrinking its preferred side gutter');
assert.deepEqual(blockRevealScrollDelta(rect(140,90,300,990),view),{x:0,y:-110},'Oversized block: top is the anchor');
assert.deepEqual(blockRevealScrollDelta(rect(140,250,300,990),view),{x:0,y:0},'Oversized block starts visible, do not jump to its end');
assert.deepEqual(blockRevealScrollDelta(rect(NaN,250,300,350),view),{x:0,y:0},'Invalid geometry is ignored');
console.log('LAB_OCR_PDF_FOCUS_VIEWPORT_PASS');
