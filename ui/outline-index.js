/**
 * Read-only, rebuildable Markdown heading index for the AG outline.
 * The PDF page is the actual 0-based pageIndex embedded by toMarkdown() in
 * <!-- minerujson:block:v1:pageIndex:blockIndex -->, displayed as pageIndex+1.
 *
 * This module only detects headings and stable MinerU IDs. The independent
 * chapter annotations and exported file paths live in separate modules.
 */
import MarkdownIt from 'markdown-it';

const parser=new MarkdownIt({html:true,linkify:false});
const blockOpen=/^<!-- minerujson:block:v1:(\d+):(\d+) -->$/;
const sourceStart=/^<!-- minerujson:source:v1:/;

export function buildOutline(markdown,independentDrafts=new Map()) {
  const lines=markdown.split('\n');
  const evidenceByLine=new Array(lines.length+1);
  let active=null;
  for(let i=0;i<lines.length;i++){
    const opening=blockOpen.exec(lines[i].trim());
    if(opening) active={pageIndex:Number(opening[1]),blockIndex:Number(opening[2])};
    else if(/^<!-- minerujson:page:v1:/.test(lines[i].trim())) active=null;
    else if(sourceStart.test(lines[i].trim())) break;
    evidenceByLine[i+1]=active;
  }
  const seen=new Map(),rows=[];
  const tokens=parser.parse(markdown,{});
  for(let i=0;i<tokens.length;i++){
    const t=tokens[i];
    if(t.type!=='heading_open' || !t.map)continue;
    const level=Number(t.tag.slice(1));
    if(level<1||level>6)continue;
    const sourceLine=t.map[0]+1;
    const span=evidenceByLine[sourceLine]||null;
    const scope=span ? `mineru:${span.pageIndex}:${span.blockIndex}` : `line:${sourceLine}`;
    const order=seen.get(scope)||0;
    seen.set(scope,order+1);
    const id=scope+':'+order;
    const title=tokens[i+1]?.type==='inline'?tokens[i+1].content.trim():lines[sourceLine-1].replace(/^\s*#{1,6}\s*/,'').trim();
    rows.push({
      id,sourceLine,sourceEnd:t.map[1]+1,
      pdfPage:span?span.pageIndex+1:null,
      level,title,
      independent:independentDrafts.get(id)??true,
      chapterFile:null,
    });
  }
  return rows;
}

// Which heading owns an arbitrary body line? A heading remains active until
// the next heading of its own or a shallower level. For a flat AG outline,
// choose the latest heading preceding the location.
export function headingAtLine(rows,line){
  let lo=0,hi=rows.length-1,last=null;
  while(lo<=hi){
    const mid=(lo+hi)>>1,entry=rows[mid];
    if(entry.sourceLine<=line){last=entry;lo=mid+1;}
    else hi=mid-1;
  }
  return last;
}
