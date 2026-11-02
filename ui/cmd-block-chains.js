/** CMD PBS/BC v1: pure source projection and optimistic edit planning.
 * Every PBS atom has exactly one chain. Singleton chains are implicit.
 * A multi-member BC is persisted on each member's ONE CMD block line.
 * Legacy MinerU anchors and old joins are read-only during migration.
 * No module-local storage, PDF writes, AG writes, or CM6 mutations.
 */
import {blockAnchor,subblockAnchor,quotePrefix,unquotePrefix} from './mineru-anchors.js';

const pbsPattern=/^p(0|[1-9]\d*)b(0|[1-9]\d*)(?:s(0|[1-9]\d*(?:\.(?:0|[1-9]\d*))*))?$/;
const tagPattern=/^<!-- cmd:block:v1((?: [a-z]+="[^"]*")*) -->$/;
const attributePattern=/ ([a-z]+)="([^"]*)"/g;
const permitted=new Set(['p','b','s','bc','seq','type','role','review','note']);
const namePattern=/^[a-z][a-z0-9_-]{0,63}$/;
const bcPattern=/^bc-[a-z0-9][a-z0-9-]{0,63}$/;
const decode=x=>x.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const encode=x=>x.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
  if(Object.keys(fields).length!==count||!uint(fields.p)||!uint(fields.b)||
    fields.s!==undefined&&!/^(0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))*$/.test(fields.s)||
    fields.bc!==undefined&&!bcPattern.test(fields.bc)||
    (fields.bc===undefined)!==(fields.seq===undefined)||
    fields.seq!==undefined&&!uint(fields.seq)||
    fields.type!==undefined&&!namePattern.test(fields.type)||
    fields.role!==undefined&&!namePattern.test(fields.role)||
    fields.review!==undefined&&!namePattern.test(fields.review)||
    fields.note!==undefined&&fields.note.length>240)return null;
  const id=`p${fields.p}b${fields.b}${fields.s===undefined?'':`s${fields.s}`}`;
  return {...fields,id,...parseCMDPBSId(id)};
}
export function serializeCMDBlockTag({id,bc,seq,type,role,review,note}){
  const pbs=parseCMDPBSId(id);
  if(!pbs)throw Error('Invalid PBS identity');
  if((bc===undefined)!==(seq===undefined)||bc!==undefined&&!bcPattern.test(bc)||
    seq!==undefined&&(!Number.isSafeInteger(seq)||seq<0))throw Error('Invalid BC membership');
  for(const value of [type,role,review])if(value!==undefined&&!namePattern.test(value))
    throw Error('Invalid CMD block metadata');
  if(note!==undefined&&(typeof note!=='string'||note.length>240))throw Error('Invalid CMD review note');
  const props=[['p',String(pbs.p)],['b',String(pbs.b)],
    ...(pbs.s.length?[['s',pbs.s.join('.')]]:[]),
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
        format:parsed?'cmd-v1':'legacy',kind:(parsed?.s.length||legacyChild)?'child':'parent',
        bc:parsed?.bc??null,seq:parsed?.seq===undefined?null:Number(parsed.seq),
        type:parsed?.type??null,role:parsed?.role??null,
        review:parsed?.review??null,note:parsed?.note??null});
    }
    offset+=line.length+1;
  }
  const seen=new Set();for(const a of atoms){
    if(seen.has(a.id))invalid.push({line:a.sourceLine,id:a.id,reason:'Duplicate PBS identity'});
    seen.add(a.id);
  }
  // Read-only recognition of legacy contiguous joins. New BC never depends on
  // adjacency; it can reference any PBS atom, including across PDF pages.
  const legacyPredecessor=new Map();
  for(let i=0;i<atoms.length;i++){
    const atom=atoms[i];if(atom.format!=='legacy'||atom.kind!=='parent')continue;
    const preceding=atoms.slice(0,i).reverse().find(a=>a.kind==='parent');
    const priorLine=lines[atom.sourceLine-2]||'';
    const m=/^<!-- ocr2md:block-join:v1 prev="(p\d+b\d+)" target="(p\d+b\d+)" -->$/.exec(unquotePrefix(priorLine).trim());
    if(m){if(m[2]!==atom.id||m[1]!==preceding?.id||!preceding||preceding.bc)
      invalid.push({line:atom.sourceLine-1,id:atom.id,reason:'Invalid legacy join'});
      else legacyPredecessor.set(atom.id,m[1]);}
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
      wanted.set(id,{id,...(materialized?{bc:chain.id,seq}:{}),
        ...(seq===0&&chain.type?{type:chain.type}:{}),
        ...(chain.roles?.[id]?{role:chain.roles[id]}:{}),
        ...(atom.review?{review:atom.review}:{}),...(atom.note?{note:atom.note}:{})});
    }
  }
  if(seen.size!==known.size)throw Error('Incomplete PBS partition');
  const edits=[];
  for(const atom of current.atoms){
    const expected=atom.rawLine;
    const insert=quotePrefix(expected)+serializeCMDBlockTag(wanted.get(atom.id));
    if(insert!==expected)edits.push({from:atom.from,to:atom.from+expected.length,expected,insert});
  }
  return {changed:edits.length,edits,chains:chains.length,atoms:current.atoms.length};
}
