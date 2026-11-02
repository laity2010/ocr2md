/** WP6 footer behavior: immutable OCR bytes, id-bound safe edits, and reload. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {queryCMDLayout} from '../ui/cmd-text-blocks.js';
import {readCMDPDFBBoxOverrides,planCMDPDFBBoxEdit,applyCMDPDFBBoxOverrides} from '../ui/cmd-pdf-bbox.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw),layout=await queryCMDLayout(source);
const original=layout.pages[0].regions[0];
assert(original?.bbox,'PDF page first region required');
const id=`p0b${original.blockIndex}`;
const [x,y,X,Y]=original.bbox;
const page=layout.pages[0].pageSize;
const next=[Math.max(0,x-1),Math.max(0,y-1),Math.min(page[0],X+1),Math.min(page[1],Y+1)];
assert.notDeepEqual(original.bbox,next);
const apply=(s,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,e)=>{
 assert.equal(text.slice(e.from,e.to),e.expected);
 return text.slice(0,e.from)+e.insert+text.slice(e.to);
},s);
const sealed=s=>s.slice(s.indexOf('<!-- minerujson:source:v1:'));
const originalTail=sealed(source);
let edited=apply(source,planCMDPDFBBoxEdit(source,layout,id,next));
assert.equal(sealed(edited),originalTail);
assert.equal(toMineruJSON(edited),raw);
assert(edited.indexOf('<!-- cmd:pdf-bbox:v1')>0);
assert(edited.indexOf('<!-- cmd:pdf-bbox:v1')<edited.indexOf('<!-- minerujson:source:v1:'));
assert.deepEqual(readCMDPDFBBoxOverrides(edited,layout).boxes[id],next);
assert.deepEqual(applyCMDPDFBBoxOverrides(layout,edited).pages[0].regions[0].bbox,next);
assert.deepEqual(original.bbox,layout.pages[0].regions[0].bbox,'sealed cached original layout unchanged');
assert.equal(planCMDPDFBBoxEdit(edited,layout,id,next).changed,0);
const childId='p4b0s1';
const childPage=layout.pages[4];const child=childPage.regions.find(r=>r.blockIndex===0).subRegions[1];
const childBox=child?.bbox||[1,1,10,10];
const repaired=[...childBox];repaired[0]=Math.max(0,repaired[0]-.25);
if(repaired[0]===childBox[0])repaired[2]=Math.min(childPage.pageSize[0],repaired[2]+.25);
edited=apply(edited,planCMDPDFBBoxEdit(edited,layout,childId,repaired));
assert.deepEqual(readCMDPDFBBoxOverrides(edited,layout).boxes[childId],repaired);
assert.equal(Object.keys(readCMDPDFBBoxOverrides(edited,layout).boxes).length,2);
const reloaded=applyCMDPDFBBoxOverrides(await queryCMDLayout(edited),edited);
assert.deepEqual(reloaded.overrides[id],next);
assert.equal(toMineruJSON(edited),raw);
assert.throws(()=>planCMDPDFBBoxEdit(edited,layout,id,[-1,0,5,5]),/Invalid/);
assert.throws(()=>planCMDPDFBBoxEdit(edited,layout,id,[0,0,page[0]+1,5]),/Invalid/);
assert.throws(()=>planCMDPDFBBoxEdit(edited,layout,'p999b0',[0,0,1,1]),/canonical/);
assert.throws(()=>planCMDPDFBBoxEdit(edited,layout,id,[0,0,NaN,4]),/Invalid/);
assert.throws(()=>readCMDPDFBBoxOverrides(edited.replace('"schema":1','"schema":4'),layout),/schema/);
assert.throws(()=>readCMDPDFBBoxOverrides(edited.replace('<!-- minerujson:source:v1:', '<!-- cmd:pdf-bbox:v1 {} -->\n<!-- minerujson:source:v1:'),layout),/duplicate/);
// A native OCR child whose bbox was suppressed as conflicting/invalid may
// acquire a user-provided effective box without inventing its native identity.
const missing=[];
for(const p of layout.pages)for(const region of p.regions)
  for(const c of region.nativeChildren||[])if(!region.subRegions.some(s=>s.path[0]===c.index))
    missing.push({page:p,index:region.blockIndex,child:c.index});
assert(missing.length>0,'fixture must contain an OCR child with suppressed geometry');
const bad=missing[0],recoveredId=`p${bad.page.pageIndex}b${bad.index}s${bad.child}`;
const recoveredBox=[1,1,15,15];
edited=apply(edited,planCMDPDFBBoxEdit(edited,layout,recoveredId,recoveredBox));
const recoveredLayout=applyCMDPDFBBoxOverrides(layout,edited);
assert(recoveredLayout.pages[bad.page.pageIndex].regions.find(r=>r.blockIndex===bad.index)
  .subRegions.some(c=>c.path[0]===bad.child&&c.recovered===true&&
    JSON.stringify(c.bbox)===JSON.stringify(recoveredBox)),'lost native child becomes visible');
assert.equal(toMineruJSON(edited),raw);
assert(!layout.pages[bad.page.pageIndex].regions.find(r=>r.blockIndex===bad.index)
  .subRegions.some(c=>c.path[0]===bad.child),'original missing child remains missing');
edited=apply(edited,planCMDPDFBBoxEdit(edited,layout,recoveredId,null));
edited=apply(edited,planCMDPDFBBoxEdit(edited,layout,id,null));
assert(!Object.hasOwn(readCMDPDFBBoxOverrides(edited,layout).boxes,id));
edited=apply(edited,planCMDPDFBBoxEdit(edited,layout,childId,null));
assert(!edited.includes('cmd:pdf-bbox:v1'));
assert.equal(edited,source,'full reset must exactly restore original Markdown');
console.log('CMD_PDF_BBOX_WP6_PURE_PASS',{parent:id,child:childId,originalJSONUntouched:true,
  effectiveOverrides:2,fullRoundtrip:true});
