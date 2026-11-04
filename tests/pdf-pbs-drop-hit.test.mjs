/** Tight, zoomed and crowded PDF gutter labels: never guess a drop target.
 * These are CSS client coordinates, independent from PDF source/page scale. */
import assert from 'node:assert/strict';
import {pickPDFDropTarget,pickPDFCoverDropTarget,pdfDropGuideCorridor,pdfDropGuideZone,pdfArrowLocalPoint} from '../ui/pdf-pbs-drop-hit.js';
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

// Parent-only THREE-choice rail: before / child / after.
assert.equal(pdfDropGuideZone(100,{left:80,right:240,width:160},false,true),'before');
assert.equal(pdfDropGuideZone(160,{left:80,right:240,width:160},false,true),'child');
assert.equal(pdfDropGuideZone(200,{left:80,right:240,width:160},false,true),'after');
assert.equal(pdfDropGuideZone(235,{left:80,right:240,width:160},true,true),'child');

// Drop acquisition must follow the ORIGINAL PDF coverage area, not a small
// label outside that area. The hovered physical box itself is highlighted.
const targetCover={node:{},id:'p1b4',rootId:'p1b4',pageId:'2',kind:'parent',
  rect:r(180,150,250,180)};
const childCover={node:{},id:'p1b4s1',rootId:'p1b4',pageId:'2',kind:'child',
  rect:r(230,185,95,72)};
const selfCover={node:{},id:'p1b3',rootId:'p1b3',pageId:'2',kind:'parent',
  rect:r(175,130,100,100)};
const coverHit=(x,y,items=[targetCover,childCover,selfCover])=>
  pickPDFCoverDropTarget(items,{x,y,clip,pageId:null,sourceId:'p1b3'});
assert.equal(coverHit(195,165)?.id,'p1b4','interior of parent bbox selects parent');
assert.equal(coverHit(260,205)?.id,'p1b4s1','inner child bbox selects child');
assert.equal(coverHit(260,205)?.node,childCover.node,'target is physical child box, not chip');
assert.equal(coverHit(230,140),null,'outside any eligible bbox must not select a gutter label');
assert.equal(coverHit(340,225)?.id,'p1b4','parent free space still selects parent');
assert.equal(coverHit(188,133),null,'source bbox is excluded');
assert.equal(coverHit(260,205,[{...childCover,pageId:'3'}])?.id,'p1b4s1',
  'any visible PDF page is eligible when pageId is unbounded');
assert.equal(pickPDFCoverDropTarget([childCover],{x:260,y:205,clip,
  pageId:'3',sourceId:'p1b3'}),null,'explicit page scoping respected');
const nativeFull={...childCover,id:'p1b4s0',rect:{...targetCover.rect}};
assert.equal(coverHit(220,190,[nativeFull,targetCover])?.id,'p1b4',
  'identical parent and body geometry prioritizes reachable parent');
const equalUnrelated={...targetCover,id:'p1b5',rootId:'p1b5',node:{},
  rect:r(200,160,250,180)};
assert.equal(coverHit(235,200,[targetCover,equalUnrelated]),null,
  'ambiguous overlap between unrelated equally sized boxes must not guess');
assert.equal(coverHit(950,205,[targetCover]),null);
console.log('PDF_COVERAGE_RECT_DROP_HIT_PASS');

// Moving from the actual PDF rectangle to the adjacent operation rail must
// preserve the selected box, without making unrelated blank space sticky.
const body=r(200,180,180,90),railBox=r(90,178,72,29);
for(const fraction of [0,.2,.4,.6,.8,1]){
  const centerA={x:(body.left+body.right)/2,y:(body.top+body.bottom)/2};
  const centerB={x:(railBox.left+railBox.right)/2,y:(railBox.top+railBox.bottom)/2};
  const x=centerA.x+(centerB.x-centerA.x)*fraction;
  const y=centerA.y+(centerB.y-centerA.y)*fraction;
  assert(pdfDropGuideCorridor(x,y,body,railBox),`handoff at ${fraction}`);
}
// A real AFTER drop aims for the right half of a 2-option rail, NOT its
// center. Every interpolated movement must stay in the same selected target.
for(const slot of [0.25,0.75]){
  const start={x:(body.left+body.right)/2,y:(body.top+body.bottom)/2};
  const finish={x:railBox.left+(railBox.right-railBox.left)*slot,
    y:(railBox.top+railBox.bottom)/2};
  for(let n=0;n<=14;n++){
    const t=n/14;
    assert(pdfDropGuideCorridor(start.x+(finish.x-start.x)*t,
      start.y+(finish.y-start.y)*t,body,railBox),
      `coverage-to-menu slot ${slot} position ${n}/14`);
  }
}
assert.equal(pdfDropGuideCorridor(700,520,body,railBox),false,
  'distant blank PDF space cannot keep stale hover');
console.log('PDF_COVER_TO_RAIL_CORRIDOR_PASS');
