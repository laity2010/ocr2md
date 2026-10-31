/** WP3: read-only continuation *candidates*, never paragraph merges.
 * CMD owns bbox and OCR text. No PDF, HTML, remote language model or CM6 write.
 * Keep the weak/ambiguous hypotheses visible for WP4 human review; labels are
 * heuristic evidence bands, NOT calibrated probabilities.
 */
const TEXT_TYPES=new Set(['text','ref_text','list','index']);
const isBody=b=>TEXT_TYPES.has(b.type)&&b.geometry&&typeof b.textHead==='string'&&b.textHead.trim().length>=14&&
  !/^(?:figure|fig\.|table|chart|exhibit)\s*[\dIVX]+[. :]/iu.test(b.textHead.trim());
const isText=isBody;
const strip=s=>String(s||'').replace(/<\/?(?:sup|sub|em|strong|span)[^>]*>/gi,'')
  .replace(/<!--[^\n]*?-->/g,'').replace(/\s+/g,' ').trim();
const lastWord=s=>(strip(s).match(/[\p{L}\p{N}-]+$/u)||[])[0]||'';
const isCompleted=s=>/[.!?。！？][\s”’"')\]]*$/u.test(strip(s));
const isDangling=s=>/(?:\b(?:the|a|an|to|of|for|in|on|at|by|with|from|and|or|as|about|than|that|which|whose|including|latest)|[A-Za-z]-)\s*$/iu.test(strip(s));
const startsContinuation=s=>/^(?:[a-z]|\d|\)|,|;|:|–|—)/u.test(strip(s));
const median=list=>{const values=[...list].sort((a,b)=>a-b);return values.length?values[Math.floor(values.length/2)]:0;};
const byTop=(a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0]||a.blockIndex-b.blockIndex;
const byBottom=(a,b)=>b.bbox[3]-a.bbox[3]||b.bbox[1]-a.bbox[1]||b.blockIndex-a.blockIndex;
const compact=s=>strip(s).slice(0,120);
function classifyPage(page,rows){
  const width=page.pageSize[0];
  const blocks=rows.filter(isText).filter(r=>r.bbox[2]-r.bbox[0]<width*.60);
  // Layout regions, not only readable OCR blocks, determine columns:
  // an entire right column can be missing as text but contain equations.
  const geometry=page.regions.filter(r=>r.bbox[2]-r.bbox[0]<width*.60);
  const geomLeft=geometry.filter(r=>r.bbox[0]<width*.35);
  const geomRight=geometry.filter(r=>r.bbox[0]>=width*.35);
  const left=blocks.filter(b=>b.bbox[0]<width*.35);
  const right=blocks.filter(b=>b.bbox[0]>=width*.35);
  const gap=median(geomRight.map(b=>b.bbox[0]))-median(geomLeft.map(b=>b.bbox[2]));
  const twoColumn=geomLeft.length>=2&&geomRight.length>=2&&gap>width*.012;
  return {kind:twoColumn?'double':'single',left:left.sort(byTop),right:right.sort(byTop),
    all:blocks.sort(byTop),width,height:page.pageSize[1],gap};
}
function evaluate(from,to,kind,details){
  if(!from||!to||from.id===to.id)return null;
  const left=strip(from.textTail),right=strip(to.textHead);
  if(!left||!right)return null;
  const complete=isCompleted(left),nextLower=startsContinuation(right),dangling=isDangling(left);
  // A sentence ending normally followed by a new capitalized sentence is
  // not enough evidence to claim a joined paragraph. Let WP4 handle it
  // manually instead of flooding the candidate inventory with false positives.
  if(complete&&!nextLower)return null;
  const evidence=[];
  let score=kind==='跨栏'?28:25;
  evidence.push(kind==='跨栏'?'相邻阅读栏的末块→首块':'相邻 PDF 页的阅读顺序末块→首块');
  if(!complete){score+=30;evidence.push('源块末尾无句末标点');}
  else evidence.push('源块以句末标点结束，须人工确认段落是否继续');
  if(nextLower){score+=25;evidence.push('目标块以小写字母或数字承接');}
  else evidence.push('目标块不是典型的句中接续开头');
  if(dangling){score+=11;evidence.push(`源块末尾疑似未完结：${lastWord(left)}`);}
  const pageBottom=from.bbox[3]/details.fromHeight;
  if(pageBottom>=.8){score+=8;evidence.push('源块靠近栏／页末');}
  if(kind==='跨页'){
    if(to.bbox[1]/details.toHeight<=.24){score+=6;evidence.push('目标块靠近新页正文顶部');}
    else{score-=15;evidence.push('目标块不在新页顶部，需谨慎');}
  }
  score=Math.min(100,Math.max(0,score));
  const band=score>=80?'高':score>=60?'中':'低';
  return {id:`${from.id}--${to.id}`,kind,fromId:from.id,toId:to.id,
    fromPage:from.pageIndex+1,toPage:to.pageIndex+1,
    fromLine:from.sourceLine,toLine:to.sourceLine,
    fromBbox:[...from.bbox],toBbox:[...to.bbox],
    fromTail:strip(left).slice(-125),toHead:compact(right.slice(0,145)),
    score,band,evidence,status:'待审阅',
    // Carry the original block locator only, not an editable paragraph ID.
    fromBlockIndex:from.blockIndex,toBlockIndex:to.blockIndex};
}
/** @param {{rows:Array,summary?:object}} inventory CMD-validated, detached */
export function scanCMDContinuationCandidates(inventory,layout){
  if(!Array.isArray(inventory?.rows)||!Array.isArray(layout?.pages)||layout.source!=='CMD-sealed-minerujson')
    throw Error('跨块候选扫描需要 CMD 已验证的版面与文本块清单');
  const grouped=layout.pages.map((page,index)=>classifyPage(page,
    inventory.rows.filter(b=>b.pageIndex===index)));
  const seen=new Set(),candidates=[],skipped=[];
  const add=(a,b,kind,details)=>{
    const entry=evaluate(a,b,kind,details);
    if(entry&&!seen.has(entry.id)){seen.add(entry.id);candidates.push(entry);}
  };
  for(let index=0;index<grouped.length;index++){
    const current=grouped[index],next=grouped[index+1];
    if(current.kind==='double'){
      const from=[...current.left].sort(byBottom)[0];
      const to=current.right[0];
      if(from&&to)add(from,to,'跨栏',{fromHeight:current.height,toHeight:current.height});
    }
    if(!next)continue;
    const lastLane=current.kind==='double'?current.right:current.all;
    const nextLane=next.kind==='double'?next.left:next.all;
    const from=[...lastLane].sort(byBottom)[0],to=nextLane[0];
    // Tables/charts/headings on the next page are important obstacles. Never
    // silently skip their bbox to join body text across the structure.
    const lastRegion=from&&layout.pages[index].regions.some(r=>
      r.bbox[1]>=from.bbox[3]-1 && r.bbox[0]>=(current.kind==='double'?current.width*.35:0) &&
      !TEXT_TYPES.has(r.type));
    if(lastRegion){skipped.push({kind:'跨页',page:index+1,reason:'源页末端存在公式／图表，阻断跨页正文拼接'});continue;}
    const preceding=to&&layout.pages[index+1].regions.some(r=>
      r.bbox[1]<to.bbox[1]-4&&!TEXT_TYPES.has(r.type));
    if(preceding){skipped.push({kind:'跨页',page:index+2,reason:'目标页正文前有标题／公式／表格／图片'});continue;}
    if(from&&to)add(from,to,'跨页',{fromHeight:current.height,toHeight:next.height});
  }
  const order={高:0,中:1,低:2};
  candidates.sort((a,b)=>order[a.band]-order[b.band]||b.score-a.score||
    a.fromPage-b.fromPage||a.fromBlockIndex-b.fromBlockIndex);
  const summary={pages:layout.pages.length,blocks:inventory.rows.length,
    doublePages:grouped.filter(x=>x.kind==='double').length,
    singlePages:grouped.filter(x=>x.kind==='single').length,
    candidates:candidates.length,
    acrossColumn:candidates.filter(c=>c.kind==='跨栏').length,
    acrossPage:candidates.filter(c=>c.kind==='跨页').length,
    high:candidates.filter(c=>c.band==='高').length,
    medium:candidates.filter(c=>c.band==='中').length,
    low:candidates.filter(c=>c.band==='低').length,
    blockedTransitions:skipped.length,
    coverage:'只扫描版面阅读边界；非完整段落识别',
  };
  return {candidates,summary,skipped,
    pageLayouts:grouped.map((p,i)=>({page:i+1,kind:p.kind,left:p.left.length,right:p.right.length}))};
}
