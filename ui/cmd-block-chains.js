/** CMD PBS/BC v1: pure source projection and optimistic edit planning.
 * Every PBS atom has exactly one chain. Singleton chains are implicit.
 * A multi-member BC is persisted on each member's ONE CMD block line.
 * Legacy MinerU anchors and old joins are read-only during migration.
 * No module-local storage, PDF writes, AG writes, or CM6 mutations.
 */
import {blockAnchor,subblockAnchor,unquotePrefix} from './mineru-anchors.js';

const pbsPattern=/^p(0|[1-9]\d*)b(0|[1-9]\d*)(?:s((?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))*))?$/;
const tagPattern=/^<!-- cmd:block:v1((?: [a-z]+="[^"]*")*) -->$/;
const attributePattern=/ ([a-z]+)="([^"]*)"/g;
const permitted=new Set(['id','origin','p','b','s','bc','seq','type','role','review','note']);
const namePattern=/^[a-z][a-z0-9_-]{0,63}$/;
const bcPattern=/^bc-[a-z0-9][a-z0-9-]{0,63}$/;
const decode=x=>x.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const encode=x=>x.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const commentPrefix=line=>line.slice(0,line.indexOf('<!--'));
const uint=x=>typeof x==='string'&&/^(0|[1-9]\d*)$/.test(x)&&Number.isSafeInteger(Number(x));

export function parseCMDPBSId(id){
  const m=typeof id==='string'?pbsPattern.exec(id):null;
  if(!m)return null;
  const p=Number(m[1]),b=Number(m[2]),s=m[3]===undefined?[]:m[3].split('.').map(Number);
  if(!Number.isSafeInteger(p)||!Number.isSafeInteger(b)||s.some(x=>!Number.isSafeInteger(x)))return null;
  return {id,p,b,s};
}
export function parseCMDBlockTag(line){
  const raw=unquotePrefix(line).trim();const match=tagPattern.exec(raw);
  if(!match)return null;
  const fields={};let count=0;
  for(const m of match[1].matchAll(attributePattern)){
    if(!permitted.has(m[1])||Object.hasOwn(fields,m[1]))return null;
    fields[m[1]]=decode(m[2]);count++;
  }
  // Fresh CMD uses one explicit PBS identity, matching PDF and AG exactly.
  // Previously published p/b/s comments remain readable, never fabricated.
  const pbs=fields.id===undefined?null:parseCMDPBSId(fields.id);
  if(Object.keys(fields).length!==count||
    (fields.id!==undefined&&(!pbs||fields.p!==undefined||fields.b!==undefined||fields.s!==undefined))||
    (fields.id===undefined&&(!uint(fields.p)||!uint(fields.b)||
      fields.s!==undefined&&!/^(0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))*$/.test(fields.s)))||
    (fields.origin!==undefined&&(!pbs||pbs.s.length!==1||
      !parseCMDPBSId(fields.origin)||parseCMDPBSId(fields.origin).s.length||
      parseCMDPBSId(fields.origin).p!==pbs.p||fields.origin===pbs.id))||
    fields.bc!==undefined&&!bcPattern.test(fields.bc)||
    (fields.bc===undefined)!==(fields.seq===undefined)||
    fields.seq!==undefined&&!uint(fields.seq)||
    fields.type!==undefined&&!namePattern.test(fields.type)||
    fields.role!==undefined&&!namePattern.test(fields.role)||
    fields.review!==undefined&&!namePattern.test(fields.review)||
    fields.note!==undefined&&fields.note.length>240)return null;
  const id=pbs?.id||`p${fields.p}b${fields.b}${fields.s===undefined?'':`s${fields.s}`}`;
  return {...fields,id,...parseCMDPBSId(id)};
}
export function serializeCMDBlockTag({id,origin,bc,seq,type,role,review,note}){
  const pbs=parseCMDPBSId(id);
  if(!pbs)throw Error('Invalid PBS identity');
  if(origin!==undefined&&(!parseCMDPBSId(origin)||parseCMDPBSId(origin).s.length||
    parseCMDPBSId(origin).p!==pbs.p||pbs.s.length!==1||origin===id))
    throw Error('Invalid original OCR PBS provenance');
  if((bc===undefined)!==(seq===undefined)||bc!==undefined&&!bcPattern.test(bc)||
    seq!==undefined&&(!Number.isSafeInteger(seq)||seq<0))throw Error('Invalid BC membership');
  for(const value of [type,role,review])if(value!==undefined&&!namePattern.test(value))
    throw Error('Invalid CMD block metadata');
  if(note!==undefined&&(typeof note!=='string'||note.length>240))throw Error('Invalid CMD review note');
  const props=[['id',pbs.id],...(origin?[['origin',origin]]:[]),
    ...(bc===undefined?[]:[['bc',bc],['seq',String(seq)]]),
    ...(['type','role','review','note'].filter(k=>({type,role,review,note})[k]!==undefined)
      .map(k=>[k,({type,role,review,note})[k]]))];
  return `<!-- cmd:block:v1${props.map(([k,v])=>` ${k}="${encode(v)}"`).join('')} -->`;
}
/** Read one flat PBS inventory from the CM6 source, never the sealed OCR bytes.
 * Mixed new and legacy input is tolerated for migration inspection; duplicate
 * identities and malformed BC memberships are explicitly reported.
 */
export function readCMDBlockChains(source){
  if(typeof source!=='string')throw TypeError('CMD source must be a string');
  const lines=source.split('\n');const atoms=[],invalid=[];let offset=0;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(line.includes('<!-- minerujson:source:v1:'))break;
    const parsed=parseCMDBlockTag(line);
    // Malformed CMD annotations must NEVER masquerade as legacy MinerU tags.
    const badNew=unquotePrefix(line).trim().startsWith('<!-- cmd:block:v1')&&!parsed;
    if(badNew)invalid.push({line:i+1,reason:'Malformed CMD PBS/BC annotation'});
    const legacyParent=parsed||badNew?null:blockAnchor(line);
    const legacyChild=parsed||badNew||legacyParent?null:subblockAnchor(line);
    if(parsed||legacyParent||legacyChild){
      const id=parsed?.id||`p${(legacyParent||legacyChild).pageIndex}b${(legacyParent||legacyChild).blockIndex}`+
        (legacyChild?`s${legacyChild.path.join('.')}`:'');
      atoms.push({id,sourceLine:i+1,from:offset,rawLine:line,
        format:parsed?'cmd-v1':'legacy',origin:parsed?.origin||id,kind:(parsed?.s.length||legacyChild)?'child':'parent',
        bc:parsed?.bc??null,seq:parsed?.seq===undefined?null:Number(parsed.seq),
        type:parsed?.type??null,role:parsed?.role??null,
        review:parsed?.review??null,note:parsed?.note??null});
    }
    offset+=line.length+1;
  }
  const seen=new Set(),origins=new Set();for(const a of atoms){
    if(seen.has(a.id))invalid.push({line:a.sourceLine,id:a.id,reason:'Duplicate PBS identity'});
    seen.add(a.id);
    if(origins.has(a.origin))invalid.push({line:a.sourceLine,id:a.id,reason:'Duplicate original OCR provenance'});
    origins.add(a.origin);
  }
  for(const a of atoms)if(a.origin!==a.id&&seen.has(a.origin))
    invalid.push({id:a.id,reason:'Original OCR identity cannot also be a visible PBS'});
  // Read-only recognition of legacy contiguous joins. New BC never depends on
  // adjacency; it can reference any PBS atom, including across PDF pages.
  const legacyPredecessor=new Map(),consumedLegacyMarks=new Set();
  for(let i=0;i<atoms.length;i++){
    const atom=atoms[i];if(atom.format!=='legacy'||atom.kind!=='parent')continue;
    const preceding=atoms.slice(0,i).reverse().find(a=>a.kind==='parent');
    const priorLine=lines[atom.sourceLine-2]||'';
    const m=/^<!-- ocr2md:block-join:v1 prev="(p\d+b\d+)" target="(p\d+b\d+)" -->$/.exec(unquotePrefix(priorLine).trim());
    if(m){if(m[2]!==atom.id||m[1]!==preceding?.id||!preceding||preceding.bc)
      invalid.push({line:atom.sourceLine-1,id:atom.id,reason:'Invalid legacy join'});
      else {legacyPredecessor.set(atom.id,m[1]);consumedLegacyMarks.add(atom.sourceLine-1);}}
  }
  // No dangling/duplicate/forged join marker may be silently dropped while
  // migrating. A predecessor marker MUST be directly above its target anchor.
  for(let i=0;i<lines.length;i++){
    const raw=unquotePrefix(lines[i]).trim();
    if(!raw.startsWith('<!-- ocr2md:block-join:v1'))continue;
    if(!consumedLegacyMarks.has(i+1))
      invalid.push({line:i+1,reason:'Orphaned or invalid legacy join marker'});
  }
  const grouping=new Map();
  for(const a of atoms){
    let chainId=a.bc;
    if(!chainId&&legacyPredecessor.has(a.id)){
      const previous=grouping.get(legacyPredecessor.get(a.id));
      chainId=previous?.chainId??`implicit:${legacyPredecessor.get(a.id)}`;
    }
    if(!chainId)chainId=`implicit:${a.id}`;
    grouping.set(a.id,{...a,chainId});
  }
  const grouped=new Map();
  for(const a of grouping.values()){
    if(!grouped.has(a.chainId))grouped.set(a.chainId,[]);
    grouped.get(a.chainId).push(a);
  }
  const chains=[];
  for(const [id,members] of grouped){
    const explicit=id.startsWith('bc-');
    if(explicit){
      const seqs=new Set(members.map(m=>m.seq));
      if(seqs.size!==members.length||!seqs.has(0)||
        [...seqs].some((v)=>!Number.isInteger(v)||v<0||v>=members.length))
        invalid.push({id,reason:'BC sequence must be 0..N-1 exactly once'});
      if(members.some(x=>x.format!=='cmd-v1'))invalid.push({id,reason:'BC member lacks CMD v1 anchor'});
      members.sort((a,b)=>a.seq-b.seq);
    }
    const type=members.find(x=>x.seq===0)?.type??members[0]?.type??null;
    if(explicit&&members.some(x=>x.type&&x.type!==type))invalid.push({id,reason:'Conflicting BC type'});
    chains.push({id,type,members:members.map(x=>x.id),size:members.length,
      explicit,sourceLine:Math.min(...members.map(x=>x.sourceLine)),
      roles:Object.fromEntries(members.filter(x=>x.role).map(x=>[x.id,x.role]))});
  }
  chains.sort((a,b)=>a.sourceLine-b.sourceLine);
  return {atoms:[...grouping.values()],chains,invalid,
    summary:{atoms:atoms.length,chains:chains.length,
      singleton:chains.filter(x=>x.size===1).length,multiple:chains.filter(x=>x.size>1).length}};
}
/** Validate an entire prospective partition. Return guarded source edits only:
 * CM6's official transaction port applies them once, with Undo/Redo.
 * Legacy anchors are NOT silently migrated by this planner.
 * `chains` contains every atom once; members[] is the order within each BC.
 */
export function planCMDBlockChainArrangement(source,chains){
  const current=readCMDBlockChains(source);
  if(current.invalid.length)throw Error('CMD PBS/BC invalid; repair before editing');
  if(current.atoms.some(x=>x.format!=='cmd-v1'))throw Error('Legacy anchors require explicit PBS migration');
  if(!Array.isArray(chains))throw TypeError('Expected complete chain arrangement');
  const known=new Map(current.atoms.map(x=>[x.id,x]));
  const seen=new Set(),chainIds=new Set(),wanted=new Map();
  for(const chain of chains){
    if(!chain||!Array.isArray(chain.members)||chain.members.length===0)
      throw Error('Empty BC not allowed');
    const materialized=chain.members.length>1||Boolean(chain.type);
    if(materialized&&(!bcPattern.test(chain.id)||chainIds.has(chain.id)))
      throw Error('Invalid or duplicate BC ID');
    if(materialized)chainIds.add(chain.id);
    if(chain.type!==undefined&&chain.type!==null&&!namePattern.test(chain.type))
      throw Error('Invalid BC object type');
    for(const [seq,id] of chain.members.entries()){
      if(!known.has(id)||seen.has(id))throw Error('Unknown or duplicate PBS member');
      seen.add(id);
      const atom=known.get(id);
      wanted.set(id,{id,...(atom.origin!==id?{origin:atom.origin}:{}),...(materialized?{bc:chain.id,seq}:{}),
        ...(seq===0&&chain.type?{type:chain.type}:{}),
        ...((chain.roles===undefined?atom.role:chain.roles?.[id])?
          {role:chain.roles===undefined?atom.role:chain.roles[id]}:{}),
        ...(atom.review?{review:atom.review}:{}),...(atom.note?{note:atom.note}:{})});
    }
  }
  if(seen.size!==known.size)throw Error('Incomplete PBS partition');
  const edits=[];
  for(const atom of current.atoms){
    const expected=atom.rawLine;
    const insert=commentPrefix(expected)+serializeCMDBlockTag(wanted.get(atom.id));
    if(insert!==expected)edits.push({from:atom.from,to:atom.from+expected.length,expected,insert});
  }
  return {changed:edits.length,edits,chains:chains.length,atoms:current.atoms.length};
}

/** Keep the complete partition and all member roles when building a new plan.
 * This is a detached projection of the current CMD source, never AG state.
 */
function editableChains(current){
  return current.chains.map(chain=>({id:chain.explicit?chain.id:null,
    type:chain.type, members:[...chain.members],roles:{...chain.roles}}));
}
function validArrangement(source){
  const current=readCMDBlockChains(source);
  if(current.invalid.length)throw Error('CMD BC relationship invalid; repair before editing');
  if(current.atoms.some(atom=>atom.format!=='cmd-v1'))
    throw Error('Legacy PBS anchors require explicit CMD migration first');
  return {current,chains:editableChains(current)};
}
function allocateId(chains){
  const existing=new Set(chains.map(c=>c.id).filter(Boolean));
  let next=1;
  while(existing.has(`bc-${String(next).padStart(4,'0')}`))next++;
  return `bc-${String(next).padStart(4,'0')}`;
}
const findChain=(chains,id)=>{
  const index=chains.findIndex(c=>c.members.includes(id));
  if(index<0)throw Error('Unknown PBS chain member');
  return index;
};
/** Merge two entire logical objects. Preserve the destination BC identity
 * where possible, or the one already explicit on the source; never rekey
 * unrelated members. Conflicting typed objects must be explicitly reviewed.
 */
export function planCMDMergeBlockChains(source,destinationId,sourceId){
  if(!parseCMDPBSId(destinationId)||!parseCMDPBSId(sourceId))throw Error('Invalid PBS ID');
  const {chains}=validArrangement(source);
  const a=findChain(chains,destinationId),b=findChain(chains,sourceId);
  if(a===b)return {changed:0,edits:[],reason:'already-same-chain'};
  const destination=chains[a],origin=chains[b];
  if(destination.type&&origin.type&&destination.type!==origin.type)
    throw Error('Conflicting BC object types; review before merge');
  const merged={id:destination.id||origin.id||allocateId(chains),
    type:destination.type||origin.type||null,
    members:[...destination.members,...origin.members],
    roles:{...destination.roles,...origin.roles}};
  chains.splice(Math.max(a,b),1);chains.splice(Math.min(a,b),1);
  chains.push(merged);
  return {...planCMDBlockChainArrangement(source,chains),resultId:merged.id,
    memberIds:[...merged.members]};
}
/** OCR structure correction, not a BC move. Re-parent exactly one original
 * top-level source atom as the next sibling of an existing native child.
 * The immutable source identity remains in origin=; no original JSON or
 * physical Markdown content is reordered. One comment line -> one Undo. */
export function planCMDReparentPBS(source,sourceId,targetId){
  const model=readCMDBlockChains(source);
  if(model.invalid.length||model.atoms.some(atom=>atom.format!=='cmd-v1'))
    throw Error('PBS source is not ready for structural correction');
  const byId=new Map(model.atoms.map(atom=>[atom.id,atom]));
  const atom=byId.get(sourceId),target=byId.get(targetId);
  if(!atom||!target)throw Error('Unknown PBS source or target');
  const from=parseCMDPBSId(sourceId),to=parseCMDPBSId(targetId);
  if(!from||!to||from.s.length||to.s.length!==1||from.p!==to.p)
    throw Error('Only a same-page parent can become the next child of a native child');
  if(atom.origin!==atom.id||model.atoms.some(a=>a.id.startsWith(sourceId+'s')))
    throw Error('Source already has children or was previously reparented');
  const ownChain=model.chains.find(c=>c.members.includes(sourceId));
  if(ownChain?.size!==1||ownChain.explicit)
    throw Error('Extract source to a singleton BC before reparenting');
  if(target.origin!==target.id||target.bc)
    throw Error('Target must be an original native child without BC rewrites');
  const newId=`p${to.p}b${to.b}s${to.s[0]+1}`;
  if(byId.has(newId))throw Error(`${newId} already exists; choose an unoccupied sibling slot`);
  const parsed=parseCMDBlockTag(atom.rawLine);
  const insert=commentPrefix(atom.rawLine)+serializeCMDBlockTag({
    id:newId,origin:atom.origin,type:parsed.type,role:parsed.role,
    review:parsed.review,note:parsed.note});
  return {changed:1,sourceId,targetId,newId,origin:atom.origin,
    edits:[{from:atom.from,to:atom.from+atom.rawLine.length,
      expected:atom.rawLine,insert}]};
}
/** Split BEFORE the specified member C: [A,B] / [C,D]. The original chain
 * identity remains with the head, the tail gets a new ID only when needed.
 */
export function planCMDSplitBlockChain(source,memberId){
  if(!parseCMDPBSId(memberId))throw Error('Invalid PBS ID');
  const {chains}=validArrangement(source);
  const i=findChain(chains,memberId),chain=chains[i];
  const position=chain.members.indexOf(memberId);
  if(position===0)return {changed:0,edits:[],reason:'already-chain-head'};
  const left=chain.members.slice(0,position),right=chain.members.slice(position);
  const head={...chain,members:left,roles:Object.fromEntries(left.filter(id=>chain.roles[id])
    .map(id=>[id,chain.roles[id]]))};
  const tail={id:null,type:chain.type,members:right,
    roles:Object.fromEntries(right.filter(id=>chain.roles[id]).map(id=>[id,chain.roles[id]]))};
  if(right.length>1||tail.type)tail.id=allocateId(chains);
  chains.splice(i,1,head,tail);
  return {...planCMDBlockChainArrangement(source,chains),headId:head.id||`implicit:${left[0]}`,
    tailId:tail.id||`implicit:${right[0]}`,headMembers:left,tailMembers:right};
}
/** Move ONE atomic PBS, not its old chain: before/after any other atom,
 * including a member on a different PDF page. Neither PDF geometry nor the
 * source's physical OCR block order changes. A no-op is byte-for-byte inert.
 */
export function planCMDMoveBlockChainMember(source,memberId,targetId,placement='after'){
  if(!parseCMDPBSId(memberId)||!parseCMDPBSId(targetId)||
    !['before','after'].includes(placement))throw Error('Invalid PBS member movement');
  const {chains}=validArrangement(source);
  const a=findChain(chains,memberId),b=findChain(chains,targetId);
  const origin=chains[a],destination=chains[b];
  if(a!==b&&origin.type&&destination.type&&origin.type!==destination.type)
    throw Error('Conflicting BC object types; review before moving member');
  const old=origin.members.indexOf(memberId);
  if(memberId===targetId)return {changed:0,edits:[],reason:'same-member'};
  if(a===b){
    origin.members.splice(old,1);
    const next=origin.members.indexOf(targetId)+(placement==='after'?1:0);
    origin.members.splice(next,0,memberId);
  }else{
    origin.members.splice(old,1);
    const next=destination.members.indexOf(targetId)+(placement==='after'?1:0);
    destination.members.splice(next,0,memberId);
    if(origin.roles[memberId]){
      destination.roles[memberId]=origin.roles[memberId];delete origin.roles[memberId];
    }
    if(!destination.type&&origin.type&&origin.members.length===0)
      destination.type=origin.type;
    if(!destination.id&&(destination.members.length>1||destination.type))
      destination.id=origin.members.length===0?origin.id||allocateId(chains):allocateId(chains);
    if(!origin.members.length)chains.splice(a,1);
  }
  return planCMDBlockChainArrangement(source,chains);
}
/** Remove exactly one PBS from its BC, preserving all other members in
 * their existing order. This is not split-at-C (which moves the whole tail).
 * An extracted atom returns to its implicit singleton unless its semantic
 * object type requires a typed singleton chain.
 */
export function planCMDExtractBlockChainMember(source,memberId){
  if(!parseCMDPBSId(memberId))throw Error('Invalid PBS member identity');
  const {chains}=validArrangement(source);
  const index=findChain(chains,memberId),origin=chains[index];
  if(origin.members.length===1)return {changed:0,edits:[],reason:'already-singleton'};
  origin.members.splice(origin.members.indexOf(memberId),1);
  const role=origin.roles[memberId];delete origin.roles[memberId];
  // Role belongs to the atom, not to the BC; it survives extraction.
  chains.push({id:null,type:null,members:[memberId],roles:role?{[memberId]:role}:{}});
  return {...planCMDBlockChainArrangement(source,chains),memberId};
}
/** Explicit, single-transaction migration of old MinerU anchors and legacy
 * predecessor joins. Copies only the original inline identity/BC relationship
 * lines: no content text, sealed OCR evidence, bbox, or other review tags.
 * Old unannotated child paths are NOT invented during migration.
 */
export function planCMDMigrateLegacyBlockChains(source){
  const current=readCMDBlockChains(source);
  if(current.invalid.length)throw Error('Invalid legacy CMD join or PBS marker; migration refused');
  const legacy=current.atoms.filter(a=>a.format==='legacy');
  if(!legacy.length)return {changed:0,edits:[],migrated:0,joins:0};
  const lines=source.split('\n');
  const chains=editableChains(current),assignments=new Map();
  for(const chain of chains){
    if(chain.members.length>1&&!chain.id)chain.id=allocateId(chains);
    for(const [seq,id] of chain.members.entries())assignments.set(id,{
      id,...(chain.id?{bc:chain.id,seq}:{}),
      ...(seq===0&&chain.type?{type:chain.type}:{}),
      ...(chain.roles[id]?{role:chain.roles[id]}:{})});
  }
  const edits=[];
  for(const atom of legacy){
    const fields=assignments.get(atom.id);
    const replacement=commentPrefix(atom.rawLine)+serializeCMDBlockTag(fields);
    edits.push({from:atom.from,to:atom.from+atom.rawLine.length,
      expected:atom.rawLine,insert:replacement});
  }
  let from=0,removed=0;
  for(const line of lines){
    if(/^<!-- ocr2md:block-join:v1 prev="p\d+b\d+" target="p\d+b\d+" -->$/.test(unquotePrefix(line).trim())){
      // Each marker's newline is removed, not the newline/quote indentation
      // of the corresponding original block identity below it.
      edits.push({from,to:from+line.length+1,expected:line+'\n',insert:''});removed++;
    }
    from+=line.length+1;
  }
  const next=[...edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
    if(s.slice(e.from,e.to)!==e.expected)throw Error('Stale migration source');
    return s.slice(0,e.from)+e.insert+s.slice(e.to);
  },source);
  const verified=readCMDBlockChains(next);
  if(verified.invalid.length||verified.atoms.length!==current.atoms.length||
    verified.chains.length!==current.chains.length||
    verified.atoms.some(a=>a.format!=='cmd-v1')||
    current.chains.some(chain=>!verified.chains.some(other=>
      other.members.length===chain.members.length&&
      other.members.every((id,i)=>id===chain.members[i]))))
    throw Error('CMD migration partition changed; refusing edits');
  return {changed:edits.length,edits,migrated:legacy.length,joins:removed};
}

/** WP4: CMD-owned complete AG projection. Keep every PBS atom, including
 * nested native children; AG never parses source annotations or OCR JSON.
 * Missing anchors remain evidence rows, NOT invented chain memberships.
 */
export function projectCMDBlockTable(source,parentRows,layout,model=readCMDBlockChains(source),nativeChildren=[]){
  if(typeof source!=='string'||!Array.isArray(parentRows)||!Array.isArray(layout?.pages))
    throw TypeError('CMD block table requires verified layout and parent inventory');
  const parents=new Map(parentRows.map(row=>[row.id,row]));
  const children=new Map(nativeChildren.map(row=>[row.id,row]));
  const member=new Map();
  for(const chain of model.chains)for(const [position,id] of chain.members.entries())
    member.set(id,{chainId:chain.id,chainLabel:chain.explicit?chain.id:chain.size>1?'旧接续':'单块',
      chainPosition:position+1,chainSize:chain.size,chainType:chain.type,
      chainRole:chain.roles[id]||null,chainPrev:position?chain.members[position-1]:null,
      chainMembers:[...chain.members]});
  const tail=source.indexOf('<!-- minerujson:source:v1:');
  const footer=source.indexOf('<!-- cmd:pdf-bbox:v1 ');
  const end=footer>=0?footer:tail<0?source.length:tail;
  const ordered=[...model.atoms].sort((a,b)=>a.from-b.from);
  const rows=ordered.map((atom,i)=>{
    const identity=parseCMDPBSId(atom.id),physical=parseCMDPBSId(atom.origin);
    const parentId=`p${identity.p}b${identity.b}`;
    const originalParentId=`p${physical.p}b${physical.b}`;
    const parent=parents.get(originalParentId),native=children.get(atom.origin);
    const root=identity.s.length===0,originalRoot=physical.s.length===0;
    const page=layout.pages[physical.p];
    const region=page?.regions.find(x=>x.blockIndex===physical.b);
    // Only direct native children have independently validated geometry in
    // the current sealed layout. Never substitute a parent's bbox for a child.
    const sub=physical.s.length===1?region?.subRegions.find(x=>x.path[0]===physical.s[0]):null;
    const bbox=originalRoot?(layout.overrides?.[atom.origin]||region?.bbox||null):
      sub?.bbox||layout.overrides?.[atom.origin]||null;
    const bodyStart=atom.from+atom.rawLine.length;
    const bodyEnd=Math.min(end,ordered[i+1]?.from??end);
    const sourceText=source.slice(Math.min(end,bodyStart),Math.max(Math.min(end,bodyStart),bodyEnd))
      .replace(/<!--[^]*?-->/g,'').replace(/\s+/g,' ').trim().slice(0,240);
    const chain=member.get(atom.id);
    return {id:atom.id,origin:atom.origin,kind:root?'parent':'child',parentId:root?null:parentId,
      childPath:identity.s.length?identity.s.join('.'):null,depth:identity.s.length,
      pageIndex:physical.p,blockIndex:physical.b,pdfPage:physical.p+1,
      sourceLine:atom.sourceLine,from:atom.from,format:atom.format,
      type:originalRoot?parent?.type||'unknown':native?.type||sub?.type||'native-child',
      ocrBBoxText:(originalRoot?(parent?.originalBBox||parent?.bbox):native?.originalBBox)?.join(', ')||'—',
      ocrRole:sub?.role||null,
      text:sourceText||(originalRoot?parent?.text||'':''),sourceText,
      originalText:originalRoot?parent?.text||'':native?.text||'',
      bbox:bbox?[...bbox]:null,bboxText:bbox?bbox.join(', '):'—',
      bboxSource:layout.overrides?.[atom.origin]?'人工修正':'原始 OCR',
      geometry:Boolean(bbox),geometryLabel:bbox?'可定位':'无有效子块坐标',
      anchorCount:1,anchorStatus:'已匹配',expectsPreview:originalRoot?Boolean(parent?.expectsPreview):Boolean(sourceText),
      previewLabel:sourceText?'待检查':'无需渲染',
      review:atom.review||'',note:atom.note||'',
      joinPrev:chain?.chainPrev||null,logicalId:parent?.logicalId||parentId,
      joinLabel:chain?.chainPrev?`↳ ${chain.chainId}`:'独立',
      chainId:chain?.chainId||`implicit:${atom.id}`,
      chainLabel:chain?.chainLabel||'无效关系',chainPosition:chain?.chainPosition??1,
      chainSize:chain?.chainSize??1,chainType:chain?.chainType||null,
      chainRole:atom.role||chain?.chainRole||null,chainPrev:chain?.chainPrev||null,
      chainMembers:chain?.chainMembers||[atom.id]};
  });
  const seen=new Set(rows.map(row=>row.origin));
  for(const parent of parentRows)if(!seen.has(parent.id))rows.push({...parent,
    kind:'parent',parentId:null,childPath:null,depth:0,format:'missing',
    chainId:null,chainLabel:'未标定',chainPosition:null,chainSize:0,
    chainType:null,chainRole:null,chainMembers:[],review:'',note:'',
    sourceText:'',originalText:parent.text||'',previewLabel:'无源码',
    geometryLabel:parent.geometry?'可定位':'无效'});
  return {rows,summary:{...model.summary,invalid:model.invalid.length,
    parents:rows.filter(r=>r.kind==='parent').length,
    children:rows.filter(r=>r.kind==='child').length,
    unanchored:rows.filter(r=>r.format==='missing').length}};
}
