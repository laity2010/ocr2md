/** Portable disposable reproduction with real Buffett PDF native child bboxes.
 * Replaces only selected child prose in memory. No live user file involved. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown} from '../../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains} from '../../ui/cmd-block-chains.js';
export function buildIllegalBreakLatexSequence(){
  const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
  const atoms=readCMDBlockChains(original).atoms;
  const replacements=[
    ['p4b0s0','The portfolio changes as follows:'],
    ['p4b0s1','<!--ocr2md:latex id="d3e5c7a9f1b24860" review="latex" delimited="auto-display"-->\n$$\nL_t = E_t + C_t,\n$$'],
    ['p4b0s2','where the leverage is measured using equity.'],
  ];
  const edits=replacements.map(([id,content])=>{
    const index=atoms.findIndex(atom=>atom.id===id);
    assert(index>=0,`missing native child ${id}`);
    return {from:atoms[index].from+atoms[index].rawLine.length,
      to:atoms[index+1]?.from??original.length,content:`\n\n${content}\n\n`};
  });
  const source=[...edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>
    s.slice(0,e.from)+e.content+s.slice(e.to),original);
  assert.equal(source.slice(source.indexOf('<!-- minerujson:source:v1:')),
    original.slice(original.indexOf('<!-- minerujson:source:v1:')),
    'original OCR JSON tail must remain sealed');
  return source;
}
