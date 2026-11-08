/** WP1: derive a clean, monolingual Markdown projection from immutable CMD.
 *
 * This is NOT a Markdown parser and does not substitute normalized AI inputs
 * for the authoritative source. Every change is an invertible source patch:
 * (a) remove OCR2MD/CMD/MinerU provenance comments, (b) break consecutive
 * sentences of the same source block onto separate lines. All other source
 * bytes, including notes, images, formulas, tables and genuine HTML comments,
 * remain in their exact source order. Source/visible anchors travel with it.
 */

const WORK_COMMENT=/<!--\s*(?:minerujson|cmd|ocr2md):[\s\S]*?-->/g;

function fail(reason){throw Error('单语 MD 重组拒绝：'+reason);}

function provenanceEdits(source){
  const edits=[];
  for(const m of source.matchAll(WORK_COMMENT)){
    let start=m.index,end=start+m[0].length;
    // Remove the complete line and following empty lines for full-line
    // workflow markers. Keep newlines *before* the marker untouched, so
    // surrounding Markdown paragraphs are never accidentally concatenated.
    const lineStart=source.lastIndexOf('\n',start-1)+1;
    const leading=source.slice(lineStart,start);
    let trailing=end;
    while(trailing<source.length && /[ \t]/.test(source[trailing]))trailing++;
    if(!leading.trim()&&(!source[trailing]||source[trailing]==='\n'||
        source.slice(trailing,trailing+2)==='\r\n')){
      start=lineStart;
      end=trailing;
      while(source[end]==='\n'||source.slice(end,end+2)==='\r\n')
        end+=source[end]==='\n'?1:2;
    }
    edits.push({from:start,to:end,insert:'',kind:'provenance'});
  }
  return edits;
}

function sentenceBreakEdit(source,row){
  const head=source.slice(row.from,row.to);
  if(!head)fail(row.id+' 句界为空');
  // Inline OCR2MD footnote refs belong to the PRECEDING sentence. Put the
  // line break after the visible [^n] marker, not before it.
  const note=/^<!--\s*ocr2md:note-ref[^>]*-->\[\^[^\]]+\]([ \t]+)/.exec(head);
  if(note){
    const from=row.from+note[0].length-note[1].length;
    return {from,to:from+note[1].length,insert:'\n',kind:'sentence',id:row.id};
  }
  const spaces=/^[ \t]+/.exec(head);
  if(spaces){
    return {from:row.from,to:row.from+spaces[0].length,
      insert:'\n',kind:'sentence',id:row.id};
  }
  fail(row.id+' 存在无法安全换行的句界 '+JSON.stringify(head.slice(0,90)));
}

function checkedRows(source,rows){
  if(typeof source!=='string'||!Array.isArray(rows))fail('缺少原始 MD 或句表');
  const ids=new Set();let prior=null;
  for(const row of rows){
    if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id)||
       typeof row.blockId!=='string'||!['sentence','text_block'].includes(row.type)||
       !Number.isInteger(row.from)||!Number.isInteger(row.to)||
       row.from<0||row.from>=row.to||row.to>source.length||
       !Array.isArray(row.sourceRanges)||!row.sourceRanges.length||
       row.sourceRanges[0]?.from!==row.from||
       row.sourceRanges.at(-1)?.to!==row.to||
       row.sourceRanges.some(x=>!Number.isInteger(x.from)||!Number.isInteger(x.to)||
         x.from<row.from||x.to>row.to||x.from>=x.to)||
       (prior&&prior.to>row.from))fail('无效、重叠或乱序的句块：'+row?.id);
    ids.add(row.id);prior=row;
  }
}

function applyEdits(source,edits){
  let output='',cursor=0;
  const patches=[];
  for(const edit of edits){
    if(edit.from<cursor||edit.to>source.length||edit.to<=edit.from)
      fail('校译改写位置重叠或超界：'+edit.kind);
    output+=source.slice(cursor,edit.from);
    const outputFrom=output.length;
    output+=edit.insert;
    patches.push({...edit,removed:source.slice(edit.from,edit.to),
      outputFrom,outputTo:output.length});
    cursor=edit.to;
  }
  return {doc:output+source.slice(cursor),patches};
}

/** Strict inverse: the complete original CMD must be recoverable byte-for-byte. */
export function restoreReviewedMD(clean){
  if(typeof clean?.doc!=='string'||typeof clean.source!=='string'||
      !Array.isArray(clean.patches))
    fail('缺少可恢复的补丁信息');
  let text=clean.doc;
  for(let i=clean.patches.length-1;i>=0;i--){
    const p=clean.patches[i];
    if(text.slice(p.outputFrom,p.outputTo)!==p.insert)
      fail('输出已被修改，无法安全恢复');
    text=text.slice(0,p.outputFrom)+p.removed+text.slice(p.outputTo);
  }
  if(text!==clean.source)fail('输出或补丁已改变，不能还原原文');
  return text;
}

function mapper(patches){
  const outputPosition=(offset)=>{
    let left=0,right=patches.length;
    while(left<right){
      const mid=(left+right)>>>1;
      if(patches[mid].to<=offset)left=mid+1;else right=mid;
    }
    if(left<patches.length&&patches[left].from<=offset){
      return patches[left].outputFrom;
    }
    const prev=patches[left-1];
    return offset-(prev?prev.to-prev.outputTo:0);
  };
  return outputPosition;
}

export function buildCleanReviewedMD(source,rows){
  checkedRows(source,rows);
  const edits=provenanceEdits(source);
  let boundaries=0;
  for(let i=1;i<rows.length;i++){
    const row=rows[i],prev=rows[i-1];
    if(row.type!=='sentence'||prev.type!=='sentence'||
        row.blockId!==prev.blockId)continue;
    if(prev.to!==row.from)fail(row.id+' 的句界不是连续来源区间');
    edits.push(sentenceBreakEdit(source,row));boundaries++;
  }
  edits.sort((a,b)=>a.from-b.from||a.to-b.to);
  const clean={...applyEdits(source,edits),source};
  const map=mapper(clean.patches);
  const anchors=rows.map(row=>{
    const patch=clean.patches.find(p=>p.kind==='sentence'&&p.id===row.id);
    return {id:row.id,from:patch?patch.outputTo:map(row.from),to:map(row.to)};
  });
  if(anchors.some(a=>a.from>a.to||a.to>clean.doc.length)||
      anchors.some((a,i)=>i>0&&a.from<anchors[i-1].from))
    fail('校译显示坐标出现错位');
  if(restoreReviewedMD(clean)!==source)fail('无法字节级还原原始审阅 MD');
  return {...clean,anchors,stats:{units:rows.length,sentenceBreaks:boundaries,
    provenanceRemoved:clean.patches.filter(p=>p.kind==='provenance').length,
    restored:true}};
}
