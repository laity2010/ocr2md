import assert from 'node:assert/strict';
import {planPDFRailDensityGroups} from '../ui/pdf-rail-density-groups.js';
const crowded=Array.from({length:14},(_,i)=>({id:`p0b${i+4}`,side:'left',
  top:120+i*26,height:24,left:3,width:42,anchorY:120+i*30}));
const sparse=Array.from({length:6},(_,i)=>({id:`p1b${i}`,side:'right',
  top:130+i*100,height:24,left:690,width:50,anchorY:130+i*100}));
const groups=planPDFRailDensityGroups([...crowded,...sparse]);
assert(groups.length>=2,'dense first-page chips should be grouped');
assert(groups.every(g=>g.ids.length>=4&&g.ids.length<=8));
assert(groups.every(g=>g.side==='left'));
assert(groups.flatMap(g=>g.ids).every(id=>crowded.some(s=>s.id===id)),
  'summary cannot invent IDs');
assert.equal(new Set(groups.flatMap(g=>g.ids)).size,groups.flatMap(g=>g.ids).length);
assert.deepEqual(planPDFRailDensityGroups(sparse),[],
  'readable sparse page keeps every native PBS label visible');
console.log('PDF_RAIL_DENSITY_GROUPS_PASS',groups.map(g=>({key:g.key,count:g.ids.length})));
