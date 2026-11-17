/** WP1/3: read-only candidates at boundaries INSIDE one reviewed logical
 * parent. CM6 MD LineID / stable BlockID are authoritative, not PBS text.
 * The returned rows are disposable AG projections, never review decisions.
 */
const PROSE_BLOCKS=new Set(['text','paragraph']);
const STRUCTURE=/^\s*(?:#{1,6}(?=\s|$)|[-*+]\s|\d+[.)]\s|>|\||!\[|\[\^|`{3,}|~{3,}|\$\$|\\\[|<|\{)/u;
const BAD_SEAM=/(?:\$|`|\||<|>|\\|https?:\/\/|www\.)/iu;

/** Return null unless BOTH physical text blocks have a plausible unfinished
 * prose boundary. A positive result means human review, not an OCR error.
 */
function seamEvidence(left,right){
  const a=left.trimEnd(),b=right.trimStart();
  if(!a||!b||STRUCTURE.test(a)||STRUCTURE.test(b))return null;
  const tail=a.slice(-100),head=b.slice(0,100);
  if(BAD_SEAM.test(tail)||BAD_SEAM.test(head))return null;
  const end=/([A-Za-z]{2,45})(-?)$/u.exec(a);
  const start=/^([a-z]{2,60})\b/u.exec(b);
  if(!end||!start)return null;
  // A full stop or an uppercase paragraph start is not evidence of an OCR
  // split. Markdown line breaks alone are not proof of a broken block.
  const splitWord=end[2]==='-';
  const aText=a.slice(-110),bText=b.slice(0,110);
  return {kind:splitWord?'跨块断词':'跨块续接',
    reason:splitWord?'前块以连字符结束，后块以小写单词开始':
      '前块未以句末标点结束，后块以小写单词继续',
    before_text:aText,after_text:bText,
    join_preview:aText+(splitWord?'':' ')+bText,
    boundary:end[1]+end[2]+' / '+start[1]};
}

/** One candidate per adjacent prose Block pair inside one logical root.
 * All fields are copied from live CM6 runtimes, never read back from SQLite.
 * The unique AFTER LineID intentionally reuses AG's tested md-row patch and
 * four-pane locator interfaces.  issue_id is stable across PBS renumbering.
 */
export function projectBlockBreakRows(mdRows,blockRows){
  if(!Array.isArray(mdRows)||!Array.isArray(blockRows))return [];
  const blocks=new Map(),children=new Map(),lines=new Map();
  for(const block of blockRows){
    if(!Number.isSafeInteger(block?.block_id)||block.absorbed_into_block_id!=null||
       block.block_group!=='para_blocks')continue;
    blocks.set(block.block_id,block);
    if(block.parent_block_id!=null){
      const group=children.get(block.parent_block_id)||[];
      group.push(block);children.set(block.parent_block_id,group);
    }
  }
  for(const line of mdRows){
    if(!blocks.has(line?.block_id)||typeof line.text!=='string'||!line.text.trim()||
       !Number.isSafeInteger(line.line_no)||typeof line.line_id!=='string')continue;
    const group=lines.get(line.block_id)||[];
    group.push(line);lines.set(line.block_id,group);
  }
  for(const group of lines.values())group.sort((a,b)=>a.line_no-b.line_no);
  const result=[];
  for(const root of blocks.values()){
    if(root.parent_block_id!=null)continue;
    const siblings=(children.get(root.block_id)||[]).filter(child=>
      child.parent_block_id===root.block_id&&child.block_id!==root.block_id);
    if(!siblings.length)continue;
    siblings.sort((a,b)=>a.sibling_order-b.sibling_order||a.block_id-b.block_id);
    // Keep non-prose or empty siblings as BARRIERS. Removing them would
    // invent an edge between two nonadjacent prose blocks.
    const chain=[root,...siblings];
    for(let i=1;i<chain.length;i++){
      const before=chain[i-1],after=chain[i];
      if(!PROSE_BLOCKS.has(before.block_type)||!PROSE_BLOCKS.has(after.block_type)||
         !lines.has(before.block_id)||!lines.has(after.block_id))continue;
      const prev=lines.get(before.block_id).at(-1),next=lines.get(after.block_id)[0];
      // A source reordering can leave a stale or conflicting Block relation.
      // Never present a fabricated forward continuation.
      if(prev.line_no>=next.line_no)continue;
      const evidence=seamEvidence(prev.text,next.text);
      if(!evidence)continue;
      result.push({
        issue_id:`block-break:${before.block_id}:${after.block_id}`,
        parent_block_id:root.block_id,pbs:root.pbs,
        before_block_id:before.block_id,before_pbs:before.pbs,
        after_block_id:after.block_id,after_pbs:after.pbs,
        before_line_id:prev.line_id,before_line_no:prev.line_no,
        after_line_id:next.line_id,
        // Same read-only identifiers as the existing MD AG row projection.
        line_id:next.line_id,line_no:next.line_no,block_id:after.block_id,
        global_page:after.global_page,...evidence,
      });
    }
  }
  return result.sort((a,b)=>a.before_line_no-b.before_line_no||
    a.line_no-b.line_no||a.issue_id.localeCompare(b.issue_id));
}
