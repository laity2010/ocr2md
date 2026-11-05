/** Explicit, one-time recovery planner for mother documents initialized from
 * an obsolete parent-only MinerU Markdown fixture. Pure: no file writes.
 *
 * The OLD fixture is used strictly as an exact-text witness for untouched
 * source scopes. Native reference comes from the original sealed MinerU JSON
 * through the upstream converter, never from PDF guessing. Review-dependent
 * parent absorption/reorder edits are never replayed, reverted or fabricated.
 */
import {readCMDBlockChains,parseCMDPBSId} from './cmd-block-chains.js';
import {readCMDSealedJSON} from './cmd-sealed-json.js';

const BODY_END=['<!-- minerujson:page:v1:','<!-- minerujson:source:v1:',
  '<!-- cmd:pbs-locations:v1 ','<!-- cmd:pdf-bbox:v1 '];

function parentGroups(source,model){
  const roots=model.atoms.filter(atom=>parseCMDPBSId(atom.id)?.s.length===0)
    .sort((a,b)=>a.from-b.from);
  const result=new Map();
  for(let i=0;i<roots.length;i++){
    const atom=roots[i];
    const start=atom.from+atom.rawLine.length;
    let stop=roots[i+1]?.from??source.length;
    for(const marker of BODY_END){
      const at=source.indexOf(marker,start);
      if(at>=0&&at<stop)stop=at;
    }
    // A group contains root's entire logical source until the next root or
    // immutable page boundary. Any other CMD tags are structural edits.
    const body=source.slice(start,stop);
    const trimmed=body.trim();
    const first=trimmed?body.indexOf(trimmed):0;
    const last=first+trimmed.length;
    result.set(atom.id,{atom,start,stop,body,trimmed,
      bodyFrom:start+first,bodyTo:start+last});
  }
  return result;
}

export async function planCMDRecoverNativeSubblocks(current,oldFixture,native){
  for(const text of [current,oldFixture,native])
    if(typeof text!=='string'||!text.includes('<!-- minerujson:source:v1:'))
      throw Error('Repair requires three complete MinerU-backed Markdown sources');
  const m=readCMDBlockChains(current),f=readCMDBlockChains(oldFixture),n=readCMDBlockChains(native);
  if(m.invalid.length||f.invalid.length||n.invalid.length||
    m.atoms.some(a=>a.format!=='cmd-v1')||n.atoms.some(a=>a.format!=='cmd-v1'))
    throw Error('Repair source CMD inventories are not validated');
  // gzip output is not a byte-level archive contract (Node/zlib versions may
  // produce different streams). Validate each sealed digest AND the decoded
  // original bytes before considering three sources equivalent. Never replace
  // or rewrite the current document's immutable footer to satisfy this check.
  const sealed=async text=>{
    const match=/<!-- minerujson:source:v1:([a-f0-9]{64})\n([a-zA-Z0-9_\-\n]+)\n-->\s*$/.exec(text);
    if(!match)throw Error('Repair requires sealed MinerU source footer');
    return readCMDSealedJSON(text).then(result=>result.bytes);
  };
  const sourceBytes=await sealed(current),oldBytes=await sealed(oldFixture),nativeBytes=await sealed(native);
  if(sourceBytes.length!==oldBytes.length||sourceBytes.length!==nativeBytes.length||
    !sourceBytes.every((value,index)=>value===oldBytes[index]&&value===nativeBytes[index]))
    throw Error('Repair sources do not refer to identical original MinerU JSON');
  const curr=parentGroups(current,m),old=parentGroups(oldFixture,f),upgraded=parentGroups(native,n);
  const children=new Map();
  for(const atom of n.atoms){
    const path=parseCMDPBSId(atom.id);
    if(!path.s.length)continue;
    const parent=`p${path.p}b${path.b}`;
    const list=children.get(parent)||[];list.push(atom.id);children.set(parent,list);
  }
  const edits=[],skipped=[],repaired=[];
  for(const [parent,childIds]of children){
    const target=curr.get(parent),witness=old.get(parent),correct=upgraded.get(parent);
    if(!target||!witness||!correct){skipped.push({parent,reason:'parent-removed'});continue;}
    if(target.atom.origin!==parent||target.atom.role||target.atom.format!=='cmd-v1'){
      skipped.push({parent,reason:'not-original-independent-parent'});continue;
    }
    if(target.trimmed!==witness.trimmed){
      skipped.push({parent,reason:'user-changed-scope'});continue;
    }
    const member=m.atoms.some(x=>x.id.startsWith(parent+'s'));
    if(member){skipped.push({parent,reason:'already-has-children'});continue;}
    if(!correct.trimmed.includes(`id="${childIds[0]}"`))
      throw Error('Native conversion missing expected source anchor '+childIds[0]);
    if(target.trimmed===correct.trimmed)continue;
    edits.push({from:target.bodyFrom,to:target.bodyTo,
      expected:target.trimmed,insert:correct.trimmed,
      parent,childIds});
    repaired.push(parent);
  }
  // Both sides of the cross-page split table must be restored together.
  const fixed=new Set(repaired);
  if(fixed.has('p3b1')!==fixed.has('p4b0'))
    throw Error('Cannot restore a split HTML table with only one side verified');
  const sorted=[...edits].sort((a,b)=>a.from-b.from);
  for(let i=1;i<sorted.length;i++)if(sorted[i].from<sorted[i-1].to)
    throw Error('Repair scopes overlap');
  let result=current;
  for(const edit of [...sorted].reverse()){
    if(result.slice(edit.from,edit.to)!==edit.expected)throw Error('Repair witness source drift');
    result=result.slice(0,edit.from)+edit.insert+result.slice(edit.to);
  }
  const after=readCMDBlockChains(result),resultBytes=await sealed(result);
  if(after.invalid.length||after.atoms.length!==m.atoms.length+
    edits.reduce((sum,e)=>sum+e.childIds.length,0)||
    m.atoms.some(atom=>!after.atoms.some(x=>x.id===atom.id&&x.origin===atom.origin))||
    after.absorbedParents.length!==m.absorbedParents.length||
    sourceBytes.length!==resultBytes.length||
    !sourceBytes.every((value,index)=>value===resultBytes[index]))
    throw Error('Repair would alter existing structural relations or original OCR evidence');
  return {edits,skipped,repaired,result,addedChildren:after.atoms.length-m.atoms.length,
    initialAtoms:m.atoms.length,finalAtoms:after.atoms.length};
}
