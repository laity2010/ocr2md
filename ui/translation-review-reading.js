/** Read-only view adapter for Main's shared Markdown renderer.
 * The canonical clean MD and reversible patches are never rewritten here.
 * An extra blank line after a confirmed sentence boundary makes Markdown-it
 * render each sentence as its own paragraph (and preserve source-line links).
 * Reviewed inline LaTeX markers are injected ONLY into this transient preview
 * projection, restoring Main's review-aware KaTeX behavior without exposing
 * CMD comments in the exported clean Markdown.
 */

function sourceToClean(clean,offset){
  const patches=clean.patches;
  let low=0,high=patches.length;
  while(low<high){
    const mid=(low+high)>>>1;
    if(patches[mid].to<=offset)low=mid+1;else high=mid;
  }
  if(low<patches.length && patches[low].from<=offset)
    return patches[low].outputFrom;
  const prior=patches[low-1];
  return offset-(prior?prior.to-prior.outputTo:0);
}

function lineAt(sortedNewlines,offset){
  let low=0,high=sortedNewlines.length;
  while(low<high){
    const mid=(low+high)>>>1;
    if(sortedNewlines[mid]<offset)low=mid+1;else high=mid;
  }
  return low+1;
}

export function buildTranslationReadingProjection(clean){
  if(typeof clean?.doc!=='string'||typeof clean.source!=='string'||
      !Array.isArray(clean.anchors)||!Array.isArray(clean.patches))
    throw Error('校译预览缺少可逆单语 MD');
  const insertions=[];
  for(const patch of clean.patches){
    if(patch.kind==='sentence'){
      if(patch.insert!=='\n'||clean.doc[patch.outputFrom]!=='\n')
        throw Error('校译预览句界补丁不匹配');
      insertions.push({at:patch.outputTo,text:'\n',kind:'break'});
    }
  }
  // Main's shared renderMarkdown only renders marked, reviewed inline math.
  // Restore these ORIGINAL review comments exclusively in the transient
  // rendering input; nothing is added to clean.doc or to a persisted file.
  for(const match of clean.source.matchAll(/<!--ocr2md:latex\b[^>]*\breview="latex"[^>]*\bdelimited="auto-inline"[^>]*-->/g)){
    const end=match.index+match[0].length;
    if(clean.source[end]!=='$')continue;
    insertions.push({at:sourceToClean(clean,end),text:match[0],kind:'inline-math'});
  }
  insertions.sort((a,b)=>a.at-b.at||a.kind.localeCompare(b.kind));
  let doc='',cursor=0;
  for(const ins of insertions){
    if(ins.at<cursor||ins.at>clean.doc.length)throw Error('校译预览插入区间非法');
    doc+=clean.doc.slice(cursor,ins.at)+ins.text;
    cursor=ins.at;
  }
  doc+=clean.doc.slice(cursor);
  const map=offset=>{
    let low=0,high=insertions.length;
    while(low<high){
      const mid=(low+high)>>>1;
      if(insertions[mid].at<=offset)low=mid+1;else high=mid;
    }
    let sum=offset;
    for(let n=0;n<low;n++)sum+=insertions[n].text.length;
    return sum;
  };
  const newlines=[];
  for(let i=0;i<doc.length;i++)if(doc[i]==='\n')newlines.push(i);
  const anchors=clean.anchors.map(anchor=>{
    const from=map(anchor.from);
    return {id:anchor.id,from,to:map(anchor.to),line:lineAt(newlines,from)};
  });
  if(new Set(anchors.map(x=>x.id)).size!==anchors.length||
      anchors.some((x,i)=>x.to>doc.length||(i&&x.from<anchors[i-1].from)))
    throw Error('校译预览锚点错位');
  return {doc,anchors,stats:{sentenceParagraphs:insertions.filter(x=>x.kind==='break').length,
    reviewedInlineMath:insertions.filter(x=>x.kind==='inline-math').length}};
}

/** Main already serves /media/ from its authoritative workspace. */
export function mainMediaURL(src){
  const match=/^media\/([A-Za-z0-9][A-Za-z0-9._-]{0,150}\.(?:jpg|jpeg|png|gif|webp))$/i.exec(src);
  return match?'/media/'+match[1]:null;
}
