/** Pure geometry boundary direct tests for iPad fixed visual viewport. */
import assert from 'node:assert/strict';
import {clientToOverlayPoint,positionFixedOverlayAt} from '../ui/lab-ocr/pdf-gesture-viewport.js';

const normal={
  clientWidth:1024,clientHeight:768,
  getBoundingClientRect:()=>({left:0,top:0,width:1024,height:768}),
};
assert.deepEqual(clientToOverlayPoint(normal,300,250),{x:300,y:250});

const translated={
  clientWidth:1024,clientHeight:768,
  getBoundingClientRect:()=>({left:131,top:79,width:1024,height:768}),
};
assert.deepEqual(clientToOverlayPoint(translated,300,250),{x:169,y:171});

const transformed={
  clientWidth:1024,clientHeight:768,
  getBoundingClientRect:()=>({left:131,top:79,width:1208.32,height:906.24}),
};
const point=clientToOverlayPoint(transformed,300,250);
assert(Math.abs(point.x-(300-131)/1.18)<1e-9);
assert(Math.abs(point.y-(250-79)/1.18)<1e-9);
assert.throws(()=>clientToOverlayPoint(transformed,NaN,1),/屏幕坐标/);
assert.throws(()=>clientToOverlayPoint({
  clientWidth:0,clientHeight:1,getBoundingClientRect:()=>({width:0,height:10}),
},1,1),/有效尺寸/);

// Simulate a transformed fixed overlay whose CSS left/top are converted
// into a translated and scaled getBoundingClientRect. The helper must hit
// the same CLIENT point as the PDF element, not assume fixed CSS 0=client 0.
function mockOverlay({offsetX=131,offsetY=79,scale=1.18}={}){
  const element={style:{left:'0px',top:'0px'},offsetWidth:190,offsetHeight:30};
  element.getBoundingClientRect=()=>({
    left:offsetX+parseFloat(element.style.left),
    top:offsetY+parseFloat(element.style.top),
    width:190*scale,height:30*scale,
  });
  return element;
}
for(const options of [{offsetX:0,offsetY:0,scale:1},
  {offsetX:131,offsetY:79,scale:1.18},
  {offsetX:-58,offsetY:110,scale:0.83}]){
  const overlay=mockOverlay(options);
  positionFixedOverlayAt(overlay,470,335);
  const box=overlay.getBoundingClientRect();
  assert(Math.abs(box.left-470)<1e-8,JSON.stringify({options,box}));
  assert(Math.abs(box.top-335)<1e-8,JSON.stringify({options,box}));
}
assert.throws(()=>positionFixedOverlayAt(mockOverlay(),Infinity,2),/有限数值/);
console.log('LAB_OCR_IPAD_GESTURE_COORDINATES_PASS');
