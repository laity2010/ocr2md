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
/** Non-PBS marker retaining the original OCR parent of an absorbed group.
 * A dissolved parent is no longer a logical block or a visible PDF label. */
export function readCMDAbsorbedParents(source){
  const pattern=/^((?: {0,3}>[ \t]?)* {0,3})<!-- cmd:absorbed-parent:v1 origin="(p\d+b\d+)" target="(p\d+b\d+)" -->[ \t]*$/gm;
  return [...source.matchAll(pattern)].map(m=>({origin:m[2],target:m[3],
    from:m.index,rawLine:m[0]}));
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
    (fields.origin!==undefined&&(!pbs||!parseCMDPBSId(fields.origin)||
      parseCMDPBSId(fields.origin).p!==pbs.p||fields.origin===pbs.id||
      !(pbs.s.length===1&&parseCMDPBSId(fields.origin).s.length===0||
        pbs.s.length===0&&parseCMDPBSId(fields.origin).s.length<=1||
        pbs.s.length>0&&parseCMDPBSId(fields.origin).s.length===pbs.s.length)))||
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
  if(origin!==undefined&&(!parseCMDPBSId(origin)||parseCMDPBSId(origin).p!==pbs.p||
    origin===id||!(pbs.s.length===1&&parseCMDPBSId(origin).s.length===0||
      pbs.s.length===0&&parseCMDPBSId(origin).s.length<=1||
      pbs.s.length>0&&parseCMDPBSId(origin).s.length===pbs.s.length)))
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
  const absorbedParents=readCMDAbsorbedParents(source);
  const absorbedOrigins=new Set();
  for(const record of absorbedParents){
    const from=parseCMDPBSId(record.origin),to=parseCMDPBSId(record.target);
    if(absorbedOrigins.has(record.origin)||!from||!to||
      from.p!==to.p||from.s.length||to.s.length||record.origin===record.target)
      invalid.push({id:record.origin,reason:'Invalid absorbed-parent provenance'});
    absorbedOrigins.add(record.origin);
  }
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(line.includes('<!-- minerujson:source:v1:'))break;
    const parsed=parseCMDBlockTag(line);
    // Malformed CMD annotations must NEVER masquerade as legacy MinerU tags.
    const badNew=unquotePrefix(line).trim().startsWith('<!-- cmd:block:v1')&&!parsed;
    if(badNew)invalid.push({line:i+1,reason:'Malformed CMD PBS/BC annotation'});
    if(unquotePrefix(line).trim().startsWith('<!-- cmd:absorbed-parent:v1')&&
      !absorbedParents.some(x=>x.from===offset))
      invalid.push({line:i+1,reason:'Malformed absorbed-parent marker'});
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
  const seen=new Set(),origins=new Map();for(const a of atoms){
    if(seen.has(a.id))invalid.push({line:a.sourceLine,id:a.id,reason:'Duplicate PBS identity'});
    seen.add(a.id);
    const previous=origins.get(a.origin);
    const bodyAlias=a.role==='body'&&a.kind==='child'&&
      previous?.kind==='parent'&&
      a.id===previous.id+'s0';
    if(previous&&!bodyAlias)
      invalid.push({line:a.sourceLine,id:a.id,reason:'Duplicate original OCR provenance'});
    if(!previous)origins.set(a.origin,a);
  }
  // Logical PBS labels may be reassigned: after swapping b3 and b4 each
  // physical origin can equal another block's displayed ID. We enforce
  // uniqueness of both ID and origin above, not cross-namespace equality.
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
  for(const absorbed of absorbedParents)
    if(atoms.some(atom=>atom.origin===absorbed.origin))
      invalid.push({id:absorbed.origin,reason:'Absorbed parent cannot remain a visible PBS'});
  return {atoms:[...grouping.values()],chains,invalid,absorbedParents,
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
/** Flatten an ORIGINAL OCR parent containing native children into another
 * same-page parent. The dissolved container is recorded as non-PBS provenance,
 * while each native child receives a direct destination sN ID in its original
 * order. The raw OCR markers/contents are never deleted, only moved in one
 * CM6 transaction; strict inverse MinerU verification restores the container.
 * Parents with their own separate body or already-reviewed children require
 * a distinct operation and are deliberately rejected rather than losing text.
 */
export function planCMDAbsorbPBSParent(source,model,sourceId,targetId){
  const from=parseCMDPBSId(sourceId),to=parseCMDPBSId(targetId);
  if(!from||!to||from.s.length||to.s.length||from.p!==to.p||sourceId===targetId)
    throw Error('Parent absorption requires two different same-page parents');
  if(model.invalid.length||model.atoms.some(a=>a.format!=='cmd-v1'))
    throw Error('Invalid CMD PBS snapshot for parent absorption');
  const byId=new Map(model.atoms.map(atom=>[atom.id,atom]));
  const src=byId.get(sourceId),dest=byId.get(targetId);
  const original=parseCMDPBSId(src?.origin),targetOriginal=parseCMDPBSId(dest?.origin);
  if(!src||!dest||!original||!targetOriginal||
    original.s.length||targetOriginal.s.length||original.p!==from.p||
    targetOriginal.p!==from.p||original.id===targetOriginal.id)
    throw Error('Absorption requires independent original OCR parent provenance');
  if(model.absorbedParents.some(record=>record.origin===src.origin))
    throw Error('Original parent is already absorbed');
  const direct=model.atoms.filter(atom=>atom.id.startsWith(sourceId+'s')&&
    parseCMDPBSId(atom.id)?.s.length===1).sort((a,b)=>a.from-b.from);
  const allChildren=model.atoms.filter(atom=>atom.id.startsWith(sourceId+'s'));
  if(!direct.length||allChildren.length!==direct.length||
    direct.some((atom,i)=>atom.id!==sourceId+'s'+i||
      atom.origin!==src.origin+'s'+i))
    throw Error('Only an unmodified consecutive native child group can be absorbed');
  for(const atom of [src,...direct]){
    const chain=model.chains.find(c=>c.members.includes(atom.id));
    if(chain?.size!==1||chain.explicit)
      throw Error('Extract source parent and native children from BC before absorption');
  }
  const ordered=[...model.atoms].sort((a,b)=>a.from-b.from);
  const sourceIndex=ordered.indexOf(src);
  if(ordered[sourceIndex+1]!==direct[0]||
    direct.some((atom,i)=>ordered[sourceIndex+i+1]!==atom))
    throw Error('Source child scopes must be contiguous');
  if(source.slice(src.from+src.rawLine.length,direct[0].from).trim())
    throw Error('Source parent has its own content; explicit body split is required');
  const nextRoot=ordered.slice(sourceIndex+direct.length+1)
    .find(a=>parseCMDPBSId(a.id)?.s.length===0);
  const nextPage=source.indexOf('<!-- minerujson:page:v1:',src.from);
  const archive=source.indexOf('<!-- minerujson:source:v1:',src.from);
  const pageBoundary=Math.min(nextPage<0?source.length:nextPage,
    archive<0?source.length:archive);
  const stop=Math.min(nextRoot?.from??pageBoundary,pageBoundary);
  const segment=source.slice(src.from,stop);
  if(stop<=direct.at(-1).from||/<!-- minerujson:(?:page|source|discarded|document-meta):v1/.test(segment))
    throw Error('Absorption cannot move sealed OCR evidence');
  const destIndex=ordered.indexOf(dest);
  const destNextRoot=ordered.slice(destIndex+1).find(a=>parseCMDPBSId(a.id)?.s.length===0);
  const destNextPage=source.indexOf('<!-- minerujson:page:v1:',dest.from);
  const destArchive=source.indexOf('<!-- minerujson:source:v1:',dest.from);
  const destBoundary=Math.min(destNextPage<0?source.length:destNextPage,
    destArchive<0?source.length:destArchive);
  const insertAt=Math.min(destNextRoot?.from??destBoundary,destBoundary);
  if(insertAt>=src.from&&insertAt<=stop)
    throw Error('Cannot absorb a parent into its own source scope');
  const destChildren=model.atoms.filter(a=>{
    const p=parseCMDPBSId(a.id);
    return p?.p===to.p&&p.b===to.b&&p.s.length===1;
  });
  const needsBody=!destChildren.length;
  if(destChildren.some(a=>a.role==='body'&&a.id!==targetId+'s0'))
    throw Error('Invalid existing destination body child');
  const bodyMarker=needsBody?commentPrefix(dest.rawLine)+serializeCMDBlockTag({
    id:targetId+'s0',origin:dest.origin,role:'body'}):null;
  const firstIndex=needsBody?1:Math.max(...destChildren.map(a=>parseCMDPBSId(a.id).s[0]))+1;
  const renames=direct.map((atom,i)=>({oldId:atom.id,newId:targetId+'s'+(firstIndex+i),
    origin:atom.origin}));
  for(const item of renames)if(byId.has(item.newId))
    throw Error('Absorbed child would overwrite an existing PBS identity');
  let moved=segment;
  const replacements=[
    {from:0,to:src.rawLine.length,
      insert:commentPrefix(src.rawLine)+
        `<!-- cmd:absorbed-parent:v1 origin="${src.origin}" target="${dest.origin}" -->`},
    ...direct.map((child,i)=>{
      const parsed=parseCMDBlockTag(child.rawLine);
      return {from:child.from-src.from,to:child.from-src.from+child.rawLine.length,
        insert:commentPrefix(child.rawLine)+serializeCMDBlockTag({
          id:renames[i].newId,origin:child.origin,type:parsed.type,
          role:parsed.role,review:parsed.review,note:parsed.note})};
    })
  ];
  for(const edit of replacements.sort((a,b)=>b.from-a.from))
    moved=moved.slice(0,edit.from)+edit.insert+moved.slice(edit.to);
  const edits=[
    {from:src.from,to:stop,expected:segment,insert:''},
    {from:insertAt,to:insertAt,expected:'',insert:moved},
  ];
  if(bodyMarker)edits.push({from:dest.from+dest.rawLine.length+1,
    to:dest.from+dest.rawLine.length+1,expected:'',insert:'\n'+bodyMarker+'\n'});
  return {changed:edits.length,edits,sourceId,targetId,
    newId:renames[0].newId,createdBodyId:bodyMarker?targetId+'s0':null,
    absorbedOrigin:src.origin,absorbedTarget:dest.origin,
    renamed:Object.fromEntries(renames.map(item=>[item.oldId,item.newId])),
    memberIds:renames.map(item=>item.newId),relocatedSourceText:true};
}
/** OCR structure correction, not a BC move. Re-parent exactly one original
 * top-level source atom as the next sibling of an existing native child.
 * The immutable source identity remains in origin=; no original JSON or
 * physical content follows its new logical child in the live Markdown, while
 * the sealed original JSON remains unchanged. Two edits, one CM6 Undo. */
export function planCMDReparentPBS(source,sourceId,targetId){
  const model=readCMDBlockChains(source);
  if(model.invalid.length||model.atoms.some(atom=>atom.format!=='cmd-v1'))
    throw Error('PBS source is not ready for structural correction');
  const byId=new Map(model.atoms.map(atom=>[atom.id,atom]));
  const atom=byId.get(sourceId),target=byId.get(targetId);
  if(!atom||!target)throw Error('Unknown PBS source or target');
  const from=parseCMDPBSId(sourceId),to=parseCMDPBSId(targetId);
  if(!from||!to||from.s.length||to.s.length>1||from.p!==to.p)
    throw Error('Only a same-page independent parent can become a direct child');
  if(model.atoms.some(a=>a.id.startsWith(sourceId+'s'))){
    // A parent's native/virtual child chip is also a valid parent-group
    // landing. Resolve it to the existing parent instead of rejecting it;
    // a whole group is absorbed, never nested below a single child.
    if(targetId.startsWith(sourceId+'s'))
      throw Error('Source already has children; cannot absorb into its own child; move a leaf instead');
    const destination='p'+to.p+'b'+to.b;
    if(!byId.has(destination))
      throw Error('The pointed child has no existing logical parent');
    return {...planCMDAbsorbPBSParent(source,model,sourceId,destination),
      pointedId:targetId};
  }
  // A reviewed leaf may be made independent, then reparented again.
  // This is only legal when its immutable provenance is an original OCR
  // *parent* on the same page. A promoted native child (origin=...sN) is
  // not silently converted into a foreign child path.
  const origin=parseCMDPBSId(atom.origin);
  if(!origin||origin.p!==from.p||origin.s.length)
    throw Error('Source must be a leaf with original parent OCR provenance');
  const ownChain=model.chains.find(c=>c.members.includes(sourceId));
  if(ownChain?.size!==1||ownChain.explicit)
    throw Error('Extract source to a singleton BC before reparenting');
  const targetOrigin=parseCMDPBSId(target.origin);
  const parent=model.atoms.find(a=>a.id===`p${to.p}b${to.b}`);
  const physicalParent=parseCMDPBSId(parent?.origin);
  if(target.bc||!targetOrigin||targetOrigin.p!==to.p||
    targetOrigin.s.length!==to.s.length||
    (to.s.length!==0&&(!physicalParent||targetOrigin.b!==physicalParent.b||
      targetOrigin.s.join('.')!==to.s.join('.'))))
    throw Error('Target must have original OCR provenance without BC rewrites');
  const siblings=model.atoms.map(a=>parseCMDPBSId(a.id)).filter(p=>
    p?.p===to.p&&p.b===to.b&&p.s.length===1);
  const parentAtom=to.s.length===0?target:parent;
  const nativeChildren=model.atoms.filter(a=>a.id.startsWith(parentAtom.id+'s'));
  const firstChild=to.s.length===0&&nativeChildren.length===0&&
    model.atoms.every(a=>a.origin!==parentAtom.origin||a.id===parentAtom.id);
  const bodyOrigin=parentAtom.origin;
  const bodyMarker=firstChild?commentPrefix(parentAtom.rawLine)+serializeCMDBlockTag({
    id:parentAtom.id+'s0',origin:bodyOrigin,role:'body'}):null;
  // A parent drop appends a direct child. A native-child drop still means
  // "immediately after this native child", preserving older PDF behavior.
  const nextIndex=firstChild?1:to.s.length?to.s[0]+1:
    siblings.length?Math.max(...siblings.map(p=>p.s[0]))+1:0;
  const newId=`p${to.p}b${to.b}s${nextIndex}`;
  if(byId.has(newId))throw Error(`${newId} already exists; choose an unoccupied sibling slot`);
  const parsed=parseCMDBlockTag(atom.rawLine);
  const insert=commentPrefix(atom.rawLine)+serializeCMDBlockTag({
    id:newId,origin:atom.origin,type:parsed.type,role:parsed.role,
    review:parsed.review,note:parsed.note});
  // A PBS tag owns its following Markdown up to the NEXT PBS tag. Move the
  // complete scope (tag, text, media and trailing whitespace), not just id=.
  // This must not include any page/sealed evidence or adjacent source atom.
  const ordered=[...model.atoms].sort((a,b)=>a.from-b.from);
  const sourceIndex=ordered.indexOf(atom),targetIndex=ordered.indexOf(target);
  // A page-end independently promoted parent can sit immediately before
  // immutable next-page evidence. Never include that evidence in the moving
  // block, even when its next CMD atom is in the following page.
  const nextAtom=ordered[sourceIndex+1]?.from??source.length;
  const nextPageBoundary=source.indexOf(`<!-- minerujson:page:v1:${from.p+1}` ,atom.from);
  const archiveBoundary=source.indexOf('<!-- minerujson:source:v1:',atom.from);
  const stop=Math.min(nextAtom,
    nextPageBoundary<0?source.length:nextPageBoundary,
    archiveBoundary<0?source.length:archiveBoundary);
  const boundaryCandidates=['<!-- minerujson:page:v1:','<!-- minerujson:source:v1:']
    .map(tag=>source.indexOf(tag,target.from+target.rawLine.length))
    .filter(pos=>pos>=0);
  const boundary=boundaryCandidates.length?Math.min(...boundaryCandidates):source.length;
  const nextRoot=ordered.slice(targetIndex+1).find(a=>parseCMDPBSId(a.id)?.s.length===0);
  // The insertion may be the last body on the page. Preserve the immutable
  // next-page marker rather than demanding a next PBS anchor.
  const destination=to.s.length?ordered[targetIndex+1]?.from??boundary:
    Math.min(nextRoot?.from??boundary,boundary);
  // Already adjacent: only the structural annotation changes. No source
  // relocation is necessary, but CM6 still gets exactly one Undoable edit.
  if(destination===atom.from){
    const edits=[{from:atom.from,to:atom.from+atom.rawLine.length,
      expected:atom.rawLine,insert}];
    if(bodyMarker)edits.push({from:parentAtom.from+parentAtom.rawLine.length+1,
      to:parentAtom.from+parentAtom.rawLine.length+1,expected:'',insert:'\n'+bodyMarker+'\n'});
    return {changed:edits.length,sourceId,targetId,newId,origin:atom.origin,
      edits,createdBodyId:bodyMarker?parentAtom.id+'s0':null,relocatedSourceText:false};
  }
  if(stop<0||!Number.isInteger(destination)||stop<=atom.from||
    destination>source.indexOf('<!-- minerujson:source:v1:')||
    destination>=atom.from&&destination<=stop)
    throw Error('Cannot move an overlapping PBS scope or sealed page evidence');
  const segment=source.slice(atom.from,stop);
  if(/<!-- minerujson:(?:page|source|document-meta):v1/.test(segment))
    throw Error('A PBS source scope must not move original OCR evidence');
  const moved=insert+segment.slice(atom.rawLine.length);
  const edits=[
    {from:atom.from,to:stop,expected:segment,insert:''},
    {from:destination,to:destination,expected:'',insert:moved}
  ];
  if(bodyMarker)edits.push({from:parentAtom.from+parentAtom.rawLine.length+1,
    to:parentAtom.from+parentAtom.rawLine.length+1,expected:'',insert:'\n'+bodyMarker+'\n'});
  return {changed:edits.length,sourceId,targetId,newId,origin:atom.origin,
    edits,createdBodyId:bodyMarker?parentAtom.id+'s0':null,relocatedSourceText:true};
}

/** Reorder independent page-level PBS scopes in one CM6 operation.
 * The immutable PBS origin (physical PDF bbox) never changes. A parent takes
 * its native/reviewed children with it; all other parents keep relative order.
 * AG projects the new source order and PDF retains the original geometry.
 */
export function planCMDReorderPBSParents(source,sourceId,targetId,placement='before'){
  if(!['before','after'].includes(placement))throw Error('Invalid PBS landing');
  const model=readCMDBlockChains(source);
  if(model.invalid.length||model.atoms.some(a=>a.format!=='cmd-v1'))
    throw Error('CMD PBS migration required before source reordering');
  const from=parseCMDPBSId(sourceId),to=parseCMDPBSId(targetId);
  if(!from||!to||from.s.length||to.s.length||from.p!==to.p)
    throw Error('Only same-page independent parents can be reordered');
  const parents=model.atoms.filter(a=>{
    const id=parseCMDPBSId(a.id);
    return id?.p===from.p&&id.s.length===0;
  }).sort((a,b)=>a.from-b.from);
  const start=parents.findIndex(a=>a.id===sourceId);
  const target=parents.findIndex(a=>a.id===targetId);
  if(start<0||target<0)throw Error('Unknown PDF parent');
  if(start===target)return {changed:0,edits:[],reason:'same-parent'};
  const group=model.chains.find(c=>c.members.includes(sourceId));
  if(group?.explicit&&group.size>1)
    throw Error('Extract the parent from its BC before reordering');
  const boundary=[source.indexOf('<!-- minerujson:page:v1:',parents[0].from),
    source.indexOf('<!-- minerujson:source:v1:',parents[0].from)]
    .filter(pos=>pos>=0).sort((a,b)=>a-b)[0];
  if(!Number.isInteger(boundary)||boundary<=parents.at(-1).from)
    throw Error('No sealed OCR page boundary after PDF parents');
  const pieces=parents.map((a,i)=>source.slice(a.from,parents[i+1]?.from??boundary));
  if(pieces.some(x=>/<!-- minerujson:(?:page|source|discarded|document-meta):v1/.test(x)))
    throw Error('Cannot reorder sealed OCR evidence');
  const reordered=parents.map((a,i)=>({id:a.id,text:pieces[i]}));
  const [moving]=reordered.splice(start,1);
  const place=reordered.findIndex(a=>a.id===targetId)+(placement==='after'?1:0);
  reordered.splice(place,0,moving);
  if(reordered.every((a,i)=>a.id===parents[i].id))
    return {changed:0,edits:[],reason:'already-ordered'};
  // The b number is a CURRENT page-sequence label, not the immutable OCR
  // blockIndex. Renumber every parent and every descendant in its moved
  // scope, while keeping origin= as the physical identity. Compute all
  // replacements against the pre-move snapshot (never chained renames).
  const renamed=new Map();
  const piecesById=new Map(parents.map((parent,i)=>[parent.id,{
    from:parent.from,to:parents[i+1]?.from??boundary}]));
  const text=reordered.map((parent,index)=>{
    const destinationRoot=`p${from.p}b${index}`;
    const oldRoot=parent.id;
    const range=piecesById.get(oldRoot);
    const memberAtoms=model.atoms.filter(atom=>atom.from>=range.from&&atom.from<range.to);
    let section=source.slice(range.from,range.to);
    const edits=[];
    for(const atom of memberAtoms){
      const parsed=parseCMDBlockTag(atom.rawLine);
      if(!parsed)throw Error('Cannot rename a non-CMD PBS child');
      if(!atom.id.startsWith(oldRoot)||
        atom.id.length>oldRoot.length&&atom.id[oldRoot.length]!=='s')
        throw Error('PBS scope does not follow its parent');
      const nextId=destinationRoot+atom.id.slice(oldRoot.length);
      if(atom.id===nextId)continue;
      renamed.set(atom.id,nextId);
      const replacement=commentPrefix(atom.rawLine)+serializeCMDBlockTag({
        id:nextId,...(atom.origin===nextId?{}:{origin:atom.origin}),
        ...(parsed.bc?{bc:parsed.bc,seq:Number(parsed.seq)}:{}),
        type:parsed.type,role:parsed.role,review:parsed.review,note:parsed.note,
      });
      edits.push({from:atom.from-range.from,to:atom.from-range.from+atom.rawLine.length,
        insert:replacement});
    }
    for(const edit of edits.reverse())
      section=section.slice(0,edit.from)+edit.insert+section.slice(edit.to);
    return section;
  }).join('');
  const fromOffset=parents[0].from;
  return {changed:1,edits:[{from:fromOffset,to:boundary,
    expected:source.slice(fromOffset,boundary),
    insert:text}],
    sourceId,targetId,placement,pageIndex:from.p,
    order:reordered.map((_,i)=>`p${from.p}b${i}`),
    renamed:Object.fromEntries(renamed),relocatedSourceText:true};
}
/** Promote one direct child (native or reviewed) to the next free page-level PBS ID.
 * This is a CMD source-scope move, not a synthetic MinerU OCR block.
 * The original physical identity survives in origin= for PDF evidence,
 * converter round-trip, and a single transactional Undo/Redo. */
export function planCMDPromotePBSChild(source,childId){
  const model=readCMDBlockChains(source);
  if(model.invalid.length||model.atoms.some(atom=>atom.format!=='cmd-v1'))
    throw Error('Invalid CMD document for native-child promotion');
  const item=model.atoms.find(atom=>atom.id===childId);
  const path=parseCMDPBSId(childId);
  if(item?.role==='body')
    throw Error('Original parent body-s0 is the container body and cannot be independently promoted');
  if(!item||!path||path.s.length!==1||item.kind!=='child'||
    !parseCMDPBSId(item.origin)||parseCMDPBSId(item.origin).p!==path.p||
    parseCMDPBSId(item.origin).s.length>1)
    throw Error('Only an original or reviewed direct child may become an independent parent');
  const chain=model.chains.find(c=>c.members.includes(childId));
  if(!chain||chain.size!==1||chain.explicit)
    throw Error('Extract the child from its BC chain before promotion');
  const root=`p${path.p}b${path.b}`;
  if(!model.atoms.some(a=>a.id===root&&a.kind==='parent'))
    throw Error('Original parent PBS marker is missing');
  const roots=model.atoms.filter(a=>{
    const p=parseCMDPBSId(a.id);return p?.p===path.p&&p.s.length===0;
  });
  const last=Math.max(...roots.map(a=>parseCMDPBSId(a.id).b));
  const newId=`p${path.p}b${last+1}`;
  if(model.atoms.some(a=>a.id===newId))throw Error('Next parent PBS already exists');
  const ordered=[...model.atoms].sort((a,b)=>a.from-b.from);
  const index=ordered.findIndex(a=>a.id===childId);
  const from=item.from,to=ordered[index+1]?.from;
  if(!Number.isInteger(to)||to<=from)throw Error('Cannot identify child source scope');
  const segment=source.slice(from,to);
  if(/<!-- minerujson:(?:page|source|discarded|document-meta):v1/.test(segment))
    throw Error('Child source scope crosses sealed MinerU evidence');
  // Page boundaries are sealed MinerU page headers, not a guessed line
  // number. If this is the final page, stop before the sealed source archive.
  const marker=new RegExp(`<!-- minerujson:page:v1:${path.p+1}\\b`);
  const nextPage=marker.exec(source);
  const end=source.indexOf('<!-- minerujson:source:v1:');
  // Original page/evidence comments are immutable at their first byte.
  // Insert into the preceding blank-line gap, never at the sealed boundary.
  const boundary=nextPage?nextPage.index:end;
  const dest=boundary-1;
  if(boundary<1||source[dest]!=='\n'||dest<=to||dest===from)
    throw Error('No safe page-end gap before sealed evidence');
  const parsed=parseCMDBlockTag(item.rawLine);
  const newTag=commentPrefix(item.rawLine)+serializeCMDBlockTag({
    id:newId,origin:item.origin,type:parsed.type,role:parsed.role,
    review:parsed.review,note:parsed.note});
  const text=newTag+segment.slice(item.rawLine.length);
  return {changed:2,sourceId:childId,newId,origin:item.origin,
    edits:[{from,to,expected:segment,insert:''},
      {from:dest,to:dest,expected:'',insert:'\n'+text}],pageIndex:path.p};
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
      joinPrev:chain?.chainPrev||null,logicalId:root?atom.id:parentId,
      joinLabel:chain?.chainPrev?`↳ ${chain.chainId}`:'独立',
      chainId:chain?.chainId||`implicit:${atom.id}`,
      chainLabel:chain?.chainLabel||'无效关系',chainPosition:chain?.chainPosition??1,
      chainSize:chain?.chainSize??1,chainType:chain?.chainType||null,
      chainRole:atom.role||chain?.chainRole||null,chainPrev:chain?.chainPrev||null,
      chainMembers:chain?.chainMembers||[atom.id]};
  });
  const seen=new Set(rows.map(row=>row.origin));
  const absorbed=new Set(model.absorbedParents?.map(a=>a.origin)||[]);
  for(const parent of parentRows)if(!seen.has(parent.id)&&!absorbed.has(parent.id))
    rows.push({...parent,
    kind:'parent',parentId:null,childPath:null,depth:0,format:'missing',
    chainId:null,chainLabel:'未标定',chainPosition:null,chainSize:0,
    chainType:null,chainRole:null,chainMembers:[],review:'',note:'',
    sourceText:'',originalText:parent.text||'',previewLabel:'无源码',
    geometryLabel:parent.geometry?'可定位':'无效'});
  return {rows,absorbedParents:model.absorbedParents||[],summary:{...model.summary,invalid:model.invalid.length,
    parents:rows.filter(r=>r.kind==='parent').length,
    children:rows.filter(r=>r.kind==='child').length,
    unanchored:rows.filter(r=>r.format==='missing').length}};
}
