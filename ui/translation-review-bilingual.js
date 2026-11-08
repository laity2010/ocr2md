/** Translation Lab display-only paired-reading projection.
 * AI JSON and canonical source text remain unchanged. Corrected English
 * edits are UTF-16 spans, suitable for read-only CodeMirror decorations.
 */

function asSingleLine(value){
  return value.replace(/\r\n?|\n/g,' ');
}

/** Minimal inserted/replaced text spans in the CORRECTED string.
 * A deletion without inserted text marks one adjacent visible codepoint.
 * The LCS is bounded for unusually long completely rewritten paragraphs.
 */
export function correctedChangeRanges(original,corrected){
  if(typeof original!=='string'||typeof corrected!=='string')
    throw Error('英文差异比较需要原文与校正英文');
  if(original===corrected)return [];
  const left=[...original],right=[...corrected];
  const positions=[0];
  for(const ch of right)positions.push(positions.at(-1)+ch.length);
  let prefix=0,suffix=0;
  while(prefix<left.length&&prefix<right.length&&left[prefix]===right[prefix])prefix++;
  while(suffix<left.length-prefix&&suffix<right.length-prefix&&
      left[left.length-1-suffix]===right[right.length-1-suffix])suffix++;
  const a=left.slice(prefix,left.length-suffix);
  const b=right.slice(prefix,right.length-suffix);
  const points=[];
  if(a.length&&b.length&&a.length*b.length<=1000000){
    const width=b.length+1;
    const lcs=new Uint16Array((a.length+1)*width);
    for(let i=a.length-1;i>=0;i--){
      for(let j=b.length-1;j>=0;j--){
        const at=i*width+j;
        lcs[at]=a[i]===b[j]?1+lcs[at+width+1]:
          Math.max(lcs[at+width],lcs[at+1]);
      }
    }
    let i=0,j=0;
    while(i<a.length||j<b.length){
      if(i<a.length&&j<b.length&&a[i]===b[j]){i++;j++;continue;}
      if(i<a.length&&(j===b.length||lcs[(i+1)*width+j]>=lcs[i*width+j+1])){
        i++;continue;
      }
      points.push(prefix+j);
      j++;
    }
  }else{
    for(let j=0;j<b.length;j++)points.push(prefix+j);
  }
  // A deletion-only edit has no new glyphs; highlight the closest surviving
  // character rather than inventing text or coloring the entire sentence.
  if(!points.length&&right.length)points.push(Math.min(prefix,right.length-1));
  const merged=[];
  for(const j of points){
    const from=positions[j],to=positions[j+1];
    const last=merged.at(-1);
    if(last&&last.to===from)last.to=to;
    else merged.push({from,to});
  }
  return merged;
}

/** One corrected English line, one Chinese line, then a blank line. */
export function buildTranslationPairs(rows,resultRows){
  if(!Array.isArray(rows)||!Array.isArray(resultRows))
    throw Error('句对缺少原文或翻译结果');
  const byId=new Map(resultRows.map(row=>[row.id,row]));
  let doc='';
  const anchors=[],edits=[];
  for(const row of rows){
    const translated=byId.get(row.id);
    if(!translated||typeof row.original!=='string'||
        typeof translated.corrected!=='string'||typeof translated.translation!=='string')
      throw Error('缺少译文 '+row.id);
    const english=asSingleLine(translated.corrected);
    const chinese=asSingleLine(translated.translation);
    const start=doc.length;
    anchors.push({id:row.id,from:start});
    for(const change of correctedChangeRanges(asSingleLine(row.original),english))
      edits.push({from:start+change.from,to:start+change.to});
    doc+=english+'\n'+chinese+'\n\n';
  }
  return {doc,anchors,edits};
}
