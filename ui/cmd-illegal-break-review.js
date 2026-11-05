/** Review decisions on ONE CMD source, not a second AG store or an edit to
 * text-block membership. A decision is a durable HTML comment; clean MD
 * export will later resolve 'merge'. Until then all characters stay intact.
 */
import {readCMDBlockChains} from './cmd-block-chains.js';
import {projectIllegalBreakPair} from './illegal-break-pair.js';
export const ILLEGAL_BREAK_REVIEW_TAG='ocr2md:illegal-break-review';
export const REVIEW_DECISIONS=Object.freeze(['待定','断行合并','忽略']);
const TO_CODE=Object.freeze({'断行合并':'merge','忽略':'ignore'});
const FROM_CODE=Object.freeze({merge:'断行合并',ignore:'忽略'});
const PBS=/^p\d+b\d+(?:s\d+)?$/;

/** Key based on the semantic pair + evidence, not absolute line/byte offset;
 * adding/removing CMD annotations cannot silently reassign a review decision.
 * Identical evidence inside one pair receives a stable occurrence index.
 */
export function keyIllegalBreakReviewRows(rows){
  const seen=new Map();
  return [...rows].sort((a,b)=>a.from-b.from||a.to-b.to).map(row=>{
    const pair=projectIllegalBreakPair(row);
    if(!pair.beforeBlockId||!pair.afterBlockId)return {...row,...pair,reviewKey:null};
    const basis=JSON.stringify([pair.beforeBlockId,pair.afterBlockId,
      row.reviewKind||row.scopeLabel||'',row.reason||'',row.left||'',
      row.right||'',row.joined||'']);
    const occurrence=seen.get(basis)||0;
    seen.set(basis,occurrence+1);
    return {...row,...pair,reviewKey:JSON.stringify([basis,occurrence])};
  });
}

export function readIllegalBreakReviewDecisions(source,annotations){
  const decisions=new Map();let stale=0;
  for(const tag of annotations){
    if(tag.tag!==ILLEGAL_BREAK_REVIEW_TAG)continue;
    const {v,key,before,after,decision}=tag.attributes||{};
    if(v!=='1'||typeof key!=='string'||key.length>1024||
      !PBS.test(before||'')||!PBS.test(after||'')||!FROM_CODE[decision]||
      decisions.has(key)) {stale++;continue;}
    try{const parsed=JSON.parse(key),basis=JSON.parse(parsed[0]);
      if(!Array.isArray(parsed)||parsed.length!==2||!Array.isArray(basis)||
        basis[0]!==before||basis[1]!==after||
        !Number.isInteger(parsed[1])||parsed[1]<0){stale++;continue;}
    }catch{stale++;continue;}
    decisions.set(key,{decision:FROM_CODE[decision],target:tag,before,after});
  }
  return {decisions,stale};
}

/** Read-then-plan. The CMD transaction port owns the actual one-step write. */
export function planIllegalBreakReviewDecision(source,row,choice,annotations){
  if(typeof source!=='string'||!row||!REVIEW_DECISIONS.includes(choice))
    throw Error('非法断行审阅选项无效');
  const {beforeBlockId:before,afterBlockId:after,reviewKey:key}=row;
  if(!PBS.test(before||'')||!PBS.test(after||'')||
    typeof key!=='string'||key.length>1024)
    throw Error('断行关系或审阅标识不可用，请重新扫描');
  const model=readCMDBlockChains(source);
  if(model.invalid.length)throw Error('CMD 子块标签无效，请先检查文本块');
  const sourceAtom=model.atoms.find(atom=>atom.id===before);
  const target=model.atoms.find(atom=>atom.id===after);
  if(!sourceAtom||!target)throw Error('断行文本块已变化，请重新扫描');
  const parsed=JSON.parse(key),basis=JSON.parse(parsed[0]);
  if(basis[0]!==before||basis[1]!==after)
    throw Error('审阅关系已经变化，请重新扫描');
  // The source must still contain exactly the candidate's original char(s)
  // or a valid first-byte witness. Never attach to stale AG offsets.
  if(!Number.isInteger(row.from)||!Number.isInteger(row.to)||row.from<0||
    row.to<row.from||row.to>source.length||source.slice(row.from,row.to)===''||
    typeof row.witness==='string'&&source.slice(row.from,row.to)!==row.witness)
    throw Error('审阅候选源码位置失效，请重新扫描');
  const {decisions,stale}=readIllegalBreakReviewDecisions(source,annotations);
  if(stale)throw Error('存在无效的断行审阅标记，请先检查源码');
  const old=decisions.get(key);
  if(old?.decision===choice||(!old&&choice==='待定'))return [];
  if(choice==='待定')return [{action:'remove',target:old.target,removeAfter:true}];
  const attrs={v:'1',key,before,after,decision:TO_CODE[choice]};
  if(old)return [{action:'update',target:old.target,tag:ILLEGAL_BREAK_REVIEW_TAG,
    attributes:attrs}];
  // Place a standalone invisible comment just BEFORE the target CMD block
  // anchor. It never splits words, math fences, CMD tags or the sealed OCR
  // JSON. For multiple review decisions each marker remains independent.
  return [{action:'insert',at:target.from,tag:ILLEGAL_BREAK_REVIEW_TAG,
    attributes:attrs,suffix:'\n'}];
}
