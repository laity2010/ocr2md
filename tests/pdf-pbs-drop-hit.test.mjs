/** Tight, zoomed and crowded PDF gutter labels: never guess a drop target.
 * These are CSS client coordinates, independent from PDF source/page scale. */
import assert from 'node:assert/strict';
import {pickPDFDropTarget,pdfDropGuideZone,pdfArrowLocalPoint} from '../ui/pdf-pbs-drop-hit.js';
const clip={left:0,top:0,right:900,bottom:700};
const r=(x,y,w,h)=>({left:x,top:y,right:x+w,bottom:y+h,width:w,height:h});
const labels=[
  {id:'p1b3',rootId:'p1b3',pageId:'2',kind:'parent',rect:r(720,220,36,9)},
  {id:'p1b4',rootId:'p1b4',pageId:'2',kind:'parent',rect:r(720,255,36,9)},
  {id:'p1b3s0',rootId:'p1b3',pageId:'2',kind:'child',rect:r(720,242,36,7)},
  {id:'p1b5',rootId:'p1b5',pageId:'2',kind:'parent',rect:r(720,300,30,9)},
];
const hit=(x,y,others=labels)=>pickPDFDropTarget(others,{x,y,clip,pageId:'2',
 sourceId:'p1b5',pointerType:'touch'});
assert.deepEqual([hit(730,205)?.id,hit(730,224)?.id,hit(730,237)?.id],
  ['p1b3','p1b3','p1b3s0']);
// Direct exact child hit must win when a neighboring parent is nearby.
assert.equal(hit(735,245)?.id,'p1b3s0');
assert.equal(hit(735,245)?.placement,'child');
assert.equal(hit(735,224)?.placement,'child');
assert.equal(hit(735,203)?.placement,'before');
assert.equal(hit(735,234)?.placement,'after');
assert.equal(hit(735,260)?.id,'p1b4');
assert.equal(hit(735,260)?.placement,'child');
// Invisible, wrong-page and own label are never eligible.
assert.equal(hit(735,305),null);
assert.equal(hit(950,220),null);
assert.equal(hit(735,220,labels.map(c=>({...c,pageId:'3'}))),null);
// A held parent may now target another visible PDF page after scrolling.
assert.equal(pickPDFDropTarget(labels.map(c=>({...c,pageId:'3'})),{
  x:735,y:220,clip,pageId:null,sourceId:'p1b5',pointerType:'touch'})?.id,'p1b3');
// Tight intersecting labels with equal hit distance must be rejected.
const overlap=[{id:'p1b1',rootId:'p1b1',pageId:'2',kind:'parent',rect:r(10,10,6,6)},
 {id:'p1b2',rootId:'p1b2',pageId:'2',kind:'parent',rect:r(10,10,6,6)}];
assert.equal(hit(12,12,overlap),null);
// Three explicit guide slots are wide enough for touch; arrow needs the
// fixed overlay's own top-left, not window.innerWidth/window.innerHeight.
const guide=r(400,300,150,29);
assert.deepEqual([pdfDropGuideZone(408,guide),pdfDropGuideZone(474,guide),
 pdfDropGuideZone(539,guide)],['before','child','after']);
assert.equal(pdfDropGuideZone(408,guide,true),'child');
assert.deepEqual(pdfArrowLocalPoint(250,320,r(30,60,850,640)),{x:220,y:260});
console.log('PDF_FIXED_LABEL_DROP_HIT_PASS');

// Parent-only two-choice rail: "child" and "after" ("before" stays locked).
assert.equal(pdfDropGuideZone(100,{left:80,right:240,width:160},false,true),'child');
assert.equal(pdfDropGuideZone(200,{left:80,right:240,width:160},false,true),'after');
assert.equal(pdfDropGuideZone(235,{left:80,right:240,width:160},true,true),'child');
