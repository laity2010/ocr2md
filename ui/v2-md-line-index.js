/** WP25A: immutable, read-only projection of one CURRENT CM6 Text and its
 * owned-LF intervals. No EditorState creation, SQL, DOM or editable copy.
 * All coordinates are CM6 UTF-16 half-open intervals including the real LF.
 */
import {collectOwnedHeadings} from './v2-live-block-type.js';
import {titleSourceParts} from './lab-ocr/title-view.js';

const EMPTY=Object.freeze([]);
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
const positive=n=>nonnegative(n)&&n>0;
const groupKey=r=>r.p+'/'+r.b;
const pbsKey=r=>groupKey(r)+'/'+r.s;

/** Input: v2SourcePort.getDoc() and getIntervals() from the same revision.
 * Output: snapshot-scoped immutable rows, bidirectional lookup and refs.
 * Build a fresh index after any document OR structure revision, and resolve
 * references only against the latest index. No legacy display LF accepted.
 */
export function createMdLineIndex(doc,intervals){
  if(!doc||!positive(doc.lines)||!nonnegative(doc.length)||
     typeof doc.line!=='function'||typeof doc.lineAt!=='function'||
     typeof doc.sliceString!=='function'||!Array.isArray(intervals))
    throw new Error('Invalid MD Line snapshot');
  let cursor=0;
  const ids=new Set(),pbs=new Set(),groups=new Set();
  for(const [i,r] of intervals.entries()){
    const previous=intervals[i-1],next=intervals[i+1];
    if(!r||!positive(r.logicalId)||ids.has(r.logicalId)||
       r.logicalOrder!==i+1||!positive(r.baseBlockId)||
       typeof r.blockType!=='string'||!nonnegative(r.p)||!nonnegative(r.b)||
       !nonnegative(r.s)||pbs.has(pbsKey(r))||Object.hasOwn(r,'groupEndPad')||
       r.from!==cursor||!positive(r.to)||r.to<=r.from||r.to>doc.length)
      throw new Error('Invalid owned MD Line interval');
    const group=groupKey(r);
    if(!previous||groupKey(previous)!==group){
      if(groups.has(group)||r.s!==0)throw new Error('Invalid MD Line PBS group');
      groups.add(group);
    }else if(r.s<=previous.s)throw new Error('Invalid MD Line PBS child order');
    const min=next&&groupKey(next)===group?1:2;
    if(r.to-r.from<min||doc.sliceString(r.to-min,r.to)!=='\n'.repeat(min))
      throw new Error('Missing real owned LF');
    ids.add(r.logicalId);pbs.add(pbsKey(r));cursor=r.to;
  }
  if(cursor!==doc.length)throw new Error('Unmapped MD Line document tail');
  const source=doc.toString();
  if(source.length!==doc.length||source.includes('\r'))throw new Error('Invalid CM6 LF source');
  // Reuse the existing V1 ATX recognition and cross-block fence exclusion.
  // Block type stays untouched; the new line type is derived independently.
  const headings=collectOwnedHeadings(source,intervals);
  const rows=[],byBlock=new Map();
  let number=1;
  for(const block of intervals){
    const owned=[],titles=new Set(headings.get(block.logicalId).map(h=>h.line));
    let from=block.from;
    while(from<block.to){
      const line=doc.line(number);
      const to=line.to+1;
      if(line.from!==from||to>block.to||doc.sliceString(line.to,to)!=='\n')
        throw new Error('MD Line boundary cuts a real source line');
      const text=line.text;
      const title=titles.has(number);
      const row=Object.freeze({
        logical_id:block.logicalId,base_blockid:block.baseBlockId,
        pbs:'p'+block.p+'b'+block.b+'s'+block.s,p:block.p,b:block.b,s:block.s,
        line_offset:owned.length,source_line:number,from,to,textTo:line.to,
        md_line:text,block_type:block.blockType,
        line_type:title?'title':text.trim()===''?'blank':'text',
        title_level:title?titleSourceParts(text).level:null,
      });
      owned.push(row);rows.push(row);
      from=to;number++;
    }
    byBlock.set(block.logicalId,Object.freeze(owned));
  }
  if(number!==doc.lines)throw new Error('MD Line coverage differs from CM6 physical lines');
  Object.freeze(rows);
  // Opaque, snapshot-local identity: even a different book or a PBS-only
  // move with byte-identical text cannot accidentally resolve a stale ref.
  const revision=Object.freeze({});
  const atSourceLine=line=>positive(line)?rows[line-1]??null:null;
  const forBlock=id=>positive(id)?byBlock.get(id)??EMPTY:EMPTY;
  const atBlockLine=(id,offset)=>nonnegative(offset)?forBlock(id)[offset]??null:null;
  const atOffset=offset=>nonnegative(offset)&&offset<doc.length?
    atSourceLine(doc.lineAt(offset).number):null;
  const makeRef=line=>{
    const row=atSourceLine(line);
    return row?Object.freeze({revision,logical_id:row.logical_id,line_offset:row.line_offset}):null;
  };
  const resolve=ref=>ref?.revision===revision?atBlockLine(ref.logical_id,ref.line_offset):null;
  return Object.freeze({
    revision,rows,atSourceLine,forBlock,atBlockLine,atOffset,makeRef,resolve,
    // CM6's terminal empty caret position is NOT another real MD Line.
    eofOwner:rows.at(-1)?.logical_id??null,
  });
}
