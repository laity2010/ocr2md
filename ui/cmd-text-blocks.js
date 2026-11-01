/** CMD read-only MinerU block inventory. The sealed JSON inside THIS CMD
 * document is authoritative; never fetch a second, drifting original JSON.
 * This owner returns detached values and never mutates CM6 source. */
import {blockAnchor,subblockAnchor,subblockTag,quotePrefix} from './mineru-anchors.js';
const sealed=/<!-- minerujson:source:v1:([a-f0-9]{64})\n([a-zA-Z0-9_\-\n]+)\n-->\s*$/;
const decode=encoded=>{
  const base64=encoded.replace(/\s/g,'').replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(base64);const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
};
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
async function inflate(bytes){
  if(typeof DecompressionStream!=='function')throw Error('浏览器不支持解压 CMD 内嵌 JSON');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
// Cache only the small geometry projection. The full decompressed OCR tree
// is deliberately short-lived: WebKit PDF.js needs its memory for page
// canvases and can crash on zoom if we retain every OCR span in parallel.
let cached=null;
async function sealedJSON(source){
  if(typeof source!=='string')throw Error('CMD 源码无效');
  const match=sealed.exec(source);
  if(!match)throw Error('CMD 缺少无损 MinerU JSON 封存区');
  const key=match[0];
  const bytes=await inflate(decode(match[2]));
  const sha=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
  if(sha!==match[1])throw Error('CMD 封存 JSON SHA-256 校验失败');
  const data=JSON.parse(new TextDecoder().decode(bytes));
  if(!Array.isArray(data.pdf_info))throw Error('CMD 封存 JSON 无 PDF 页面');
  return {data,end:match.index,key};
}
/** Annotate native `blocks[]` paths inside existing edited CMD without
 * regenerating any text. One optimistic CM6 transaction and one Undo.
 * This is an explicit operation: opening an old document never auto-edits.
 */
export async function planCMDSubblockAnnotations(source){
  const {data}=await sealedJSON(source);
  const lines=source.split('\n');
  const rootAnchors=[];
  for(let i=0;i<lines.length;i++){
    const a=blockAnchor(lines[i]);
    if(a)rootAnchors.push({...a,lineIndex:i});
  }
  const expectedTotal=data.pdf_info.reduce((n,p)=>n+p.para_blocks.length,0);
  if(rootAnchors.length!==expectedTotal)throw Error('顶层 CMD 块锚点数量不符，拒绝补标子块');
  const expectedMarkers=(node,pageIndex,blockIndex)=>{
    const tags=[];
    const visit=(parent,path)=>{
      for(const [i,child] of (parent.blocks||[]).entries()){
        const next=[...path,i];tags.push({path:next.join('.'),type:child.type||'unknown',
          tag:subblockTag(pageIndex,blockIndex,next,child.type||'unknown'),child});
        visit(child,next);
      }
    };
    visit(node,[]);return tags;
  };
  const edits=[];let total=0,existing=0;
  let offset=0;const starts=[];
  for(const line of lines){starts.push(offset);offset+=line.length+1;}
  for(let i=0;i<rootAnchors.length;i++){
    const root=rootAnchors[i];
    const block=data.pdf_info[root.pageIndex]?.para_blocks[root.blockIndex];
    if(!block)throw Error('CMD 块锚点与封存 MinerU 不对应');
    const expected=expectedMarkers(block,root.pageIndex,root.blockIndex);
    const stop=rootAnchors[i+1]?.lineIndex??lines.length;
    const found=[];
    for(let line=root.lineIndex+1;line<stop;line++){
      if(lines[line].includes('minerujson:source:v1:'))break;
      const tag=subblockAnchor(lines[line]);
      if(tag)found.push(tag);
    }
    if(found.length){
      const byPath=new Map(expected.map(tag=>[tag.path,tag.type]));
      const seen=new Set();
      if(found.length!==expected.length||found.some(tag=>{
        const path=tag.path.join('.');
        if(tag.pageIndex!==root.pageIndex||tag.blockIndex!==root.blockIndex||
          !byPath.has(path)||seen.has(path))return true;
        seen.add(path);return false;
      }))throw Error(`CMD 子块标定缺失或次序不符：p${root.pageIndex}b${root.blockIndex}`);
      existing+=found.length;continue;
    }
    if(!expected.length)continue;
    const fallback=root.lineIndex+1;
    const perLine=new Map();
    for(const entry of expected){
      const spans=(entry.child.lines||[]).flatMap(line=>line.spans||[]);
      const plain=(entry.child.lines||[]).map(line=>(line.spans||[])
        .map(span=>span.content||'').join('')).filter(Boolean).join(' ').trim();
      const token=plain.slice(0,Math.min(28,plain.length));
      const html=spans.some(span=>typeof span.html==='string'&&span.html.length);
      const image=spans.some(span=>typeof span.image_path==='string'&&span.image_path.length);
      let target=fallback;
      for(let line=fallback;line<stop;line++){
        if(lines[line].includes('minerujson:source:v1:'))break;
        const text=lines[line].replace(/^\s*>\s?/,'').trim();
        if(token&&text.includes(token)||html&&/^<table[\s>]/i.test(text)||
          image&&/^!\[/.test(text)){
          target=line;break;
        }
      }
      const tags=perLine.get(target)||[];tags.push(entry.tag);perLine.set(target,tags);
      total++;
    }
    for(const [line,tags] of perLine){
      const prefix=quotePrefix(lines[line]||lines[root.lineIndex]);
      const at=line===fallback?starts[root.lineIndex]+lines[root.lineIndex].length+1:starts[line];
      // Insert only new comment lines; every pre-existing byte is preserved.
      const insert=tags.map(tag=>prefix+tag+'\n').join('');
      edits.push({from:at,to:at,expected:'',insert});
    }
  }
  edits.sort((a,b)=>a.from-b.from);
  return {edits,inserted:total,existing};
}

/** Parent display bbox is the minimum enclosing rectangle of *visible*
 * native MinerU children. Conflicting or invalid child OCR coordinates have
 * already been excluded by the page-level evidence checks. The sealed parent
 * bbox is retained separately and never rewritten. */
export function enclosingChildBBox(children,original){
  if(!Array.isArray(children)||!children.length)return [...original];
  const bounds=children.map(child=>child.bbox);
  return [Math.min(...bounds.map(b=>b[0])),Math.min(...bounds.map(b=>b[1])),
    Math.max(...bounds.map(b=>b[2])),Math.max(...bounds.map(b=>b[3]))];
}

/** Pure read-only original MinerU geometry. This is a CMD-owned capability,
 * including page size and text-block rectangles. Detailed line and span
 * coordinates are provided on demand by queryCMDBlockGeometry().
 * PDF widgets must not independently fetch the workspace OCR JSON.
 */
export async function queryCMDLayout(source){
  if(typeof source!=='string')throw Error('CMD 源码无效');
  const sourceMatch=sealed.exec(source);
  if(!sourceMatch)throw Error('CMD 缺少无损 MinerU JSON 封存区');
  if(cached?.key===sourceMatch[0])return cached.layout;
  const {data,key}=await sealedJSON(source);
  const pages=data.pdf_info.map((page,pageIndex)=>{
    if(!Array.isArray(page.para_blocks))throw Error('CMD 原始页面缺少 para_blocks');
    const pageSize=page.page_size;
    if(!Array.isArray(pageSize)||pageSize.length!==2||!pageSize.every(v=>Number.isFinite(v)&&v>0))
      throw Error(`CMD 第 ${pageIndex+1} 页尺寸缺失或无效`);
    const regions=page.para_blocks.flatMap((block,blockIndex)=>{
      const box=block.bbox;
      if(!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite))return [];
      // Native pNbMsN ID is the actual position in MinerU `blocks[]`.
      // A child carries its OWN bbox; never infer a rectangle from prose.
      const subRegions=Array.isArray(block.blocks)?
        (block.blocks||[]).flatMap((child,childIndex)=>{
          const bbox=child.bbox;
          if(!Array.isArray(bbox)||bbox.length!==4||!bbox.every(Number.isFinite)||
            bbox[0]<0||bbox[1]<0||bbox[2]<=bbox[0]||bbox[3]<=bbox[1]||
            bbox[2]>pageSize[0]||bbox[3]>pageSize[1])return [];
          // A MinerU child may carry a wrong bbox belonging visually to an
          // entirely different top-level Block. Example: page 4's p3b1 table
          // note was placed inside p3b0 (96% overlap), creating a phantom
          // selection across the first table. Keep the original OCR JSON
          // untouched; only suppress provably conflicting PDF overlay evidence.
          const childArea=(bbox[2]-bbox[0])*(bbox[3]-bbox[1]);
          const conflicts=page.para_blocks.some((other,i)=>{
            if(i===blockIndex)return false;
            const r=other.bbox;
            if(!Array.isArray(r)||r.length!==4||!r.every(Number.isFinite))return false;
            const width=Math.max(0,Math.min(bbox[2],r[2])-Math.max(bbox[0],r[0]));
            const height=Math.max(0,Math.min(bbox[3],r[3])-Math.max(bbox[1],r[1]));
            return width*height/childArea>0.5;
          });
          if(conflicts)return [];
          // MinerU may classify a paragraph beginning "Notes:" as
          // chart_caption rather than chart_footnote. Keep the OCR type
          // intact, expose the display role separately (no text cache).
          const opening=(child.lines?.[0]?.spans||[]).map(s=>s.content||'').join('').trim();
          const role=child.type.endsWith('_footnote')||/^Notes?\s*[:：]/i.test(opening)?
            'note':child.type.endsWith('_caption')?'caption':'body';
          return [{type:child.type,role,bbox:[...bbox],path:[childIndex]}];
        }):[];
      const bodyIndex=(block.blocks||[]).findIndex(c=>c.type===`${block.type}_body`);
      return [{blockIndex,bbox:enclosingChildBBox(subRegions,box),
        originalBBox:[...box],type:block.type||'unknown',subRegions,
        bodyPath:bodyIndex<0?null:[bodyIndex]}];
    });
    return {pageIndex,pageSize:[...pageSize],regions};
  });
  const layout={pages,source:'CMD-sealed-minerujson'};
  // Prevent accidental mutation of shared cache by layout or AG consumers.
  for(const page of pages){Object.freeze(page.pageSize);
    for(const region of page.regions){Object.freeze(region.bbox);
      Object.freeze(region.originalBBox);
      for(const sub of region.subRegions){Object.freeze(sub.bbox);Object.freeze(sub.path);Object.freeze(sub);}
      Object.freeze(region.subRegions);
      if(region.bodyPath)Object.freeze(region.bodyPath);
      Object.freeze(region);
    }
    Object.freeze(page.regions);Object.freeze(page);
  }
  Object.freeze(pages);Object.freeze(layout);
  cached={key,layout};
  return layout;
}
export async function queryCMDBlockGeometry(source,pageIndex,blockIndex){
  if(!Number.isInteger(pageIndex)||!Number.isInteger(blockIndex)||pageIndex<0||blockIndex<0)
    throw Error('CMD Block ID 无效');
  const layout=await queryCMDLayout(source);
  const page=layout.pages[pageIndex];
  const block=page?.regions.find(r=>r.blockIndex===blockIndex);
  if(!block)return null;
  const {data}=await sealedJSON(source);
  const original=data.pdf_info[pageIndex].para_blocks[blockIndex];
  const lines=(original.lines||[]).map(line=>({
    bbox:Array.isArray(line.bbox)?[...line.bbox]:null,
    spans:(line.spans||[]).map(span=>({bbox:Array.isArray(span.bbox)?[...span.bbox]:null,
      type:span.type||'unknown',content:typeof span.content==='string'?span.content:''})),
  }));
  return {pageIndex,blockIndex,pageSize:page.pageSize,bbox:[...original.bbox],
    coverageBBox:[...block.bbox],type:block.type,lines};
}
function anchorLines(source){
  const result=new Map();let from=0;
  for(const [index,line] of source.split('\n').entries()){
    const key=blockAnchor(line);
    if(key){const id=`p${key.pageIndex}b${key.blockIndex}`;
      const existing=result.get(id)||[];existing.push({line:index+1,from});result.set(id,existing);
    }
    from+=line.length+1;
  }
  return result;
}
const blockText=block=>{
  const lines=(block.lines||[]).map(line=>(line.spans||[]).map(s=>s.content||'').join('')).filter(Boolean);
  if(lines.length)return lines.join(' ').replace(/\s+/g,' ').trim();
  for(const child of block.blocks||[]){const value=blockText(child);if(value)return value;}
  return '';
};
const summary=block=>{
  const lines=(block.lines||[]).map(line=>(line.spans||[]).map(s=>s.content||'').join('')).filter(Boolean);
  if(lines.length)return lines.join(' ').replace(/\s+/g,' ').trim().slice(0,240);
  for(const child of block.blocks||[]){const value=summary(child);if(value)return value;}
  return block.type==='image'?'[图片]':block.type==='table'?'[表格]':block.type==='chart'?'[图表]':'';
};
export async function inspectCMDTextBlocks(source){
  const {data,end}=await sealedJSON(source);
  const anchors=anchorLines(source),expected=new Set(),rows=[];
  for(const [pageIndex,page] of data.pdf_info.entries()){
    if(!Array.isArray(page.para_blocks))throw Error('CMD 原始页面缺少 para_blocks');
    for(const [blockIndex,block] of page.para_blocks.entries()){
      const id=`p${pageIndex}b${blockIndex}`;expected.add(id);
      const rawText=blockText(block);
      const positions=anchors.get(id)||[];
      const bbox=block.bbox;
      const hasBbox=Array.isArray(bbox)&&bbox.length===4&&bbox.every(Number.isFinite)&&
        bbox[2]>bbox[0]&&bbox[3]>bbox[1];
      const pageSize=page.page_size;
      const validPage=Array.isArray(pageSize)&&pageSize.length===2&&pageSize.every(n=>Number.isFinite(n)&&n>0);
      const geometry=Boolean(hasBbox&&validPage&&bbox[0]>=0&&bbox[1]>=0&&bbox[2]<=pageSize[0]&&bbox[3]<=pageSize[1]);
      rows.push({id,pageIndex,blockIndex,pdfPage:pageIndex+1,type:block.type||'unknown',
        text:summary(block),textHead:rawText.slice(0,180),textTail:rawText.slice(-220),
        bbox:hasBbox?[...bbox]:null,pageSize:validPage?[...pageSize]:null,
        geometry,sourceLine:positions[0]?.line??null,from:positions[0]?.from??null,
        anchorCount:positions.length,anchorStatus:positions.length===1?'已匹配':positions.length===0?'缺少锚点':'重复锚点',
        bboxText:hasBbox?bbox.join(', '):'无坐标'});
    }
  }
  // Visible Markdown body may intentionally be empty: OCR contained a
  // blank text block or a metadata-only item. These must NOT be counted as
  // reader coverage failures while still remaining inventory rows.
  const ordered=rows.filter(row=>row.from!==null).sort((a,b)=>a.from-b.from);
  for(const [i,row] of ordered.entries()){
    const next=ordered[i+1]?.from??end;
    const firstEnd=source.indexOf('\n',row.from);
    const prose=source.slice(firstEnd+1,next).replace(/<!--[\s\S]*?-->/g,'').trim();
    row.expectsPreview=Boolean(prose);
  }
  for(const row of rows)if(row.from===null)row.expectsPreview=false;
  const unknown=[...anchors].filter(([id])=>!expected.has(id)).map(([id,positions])=>({id,positions}));
  const duplicate=rows.filter(row=>row.anchorCount>1);
  return {rows,summary:{sourceSha:sealed.exec(source)[1],pages:data.pdf_info.length,blocks:rows.length,
    matched:rows.filter(row=>row.anchorCount===1).length,
    missing:rows.filter(row=>row.anchorCount===0).length,duplicates:duplicate.length,
    withGeometry:rows.filter(row=>row.geometry).length,
    withoutGeometry:rows.filter(row=>!row.geometry).length,
    readable:rows.filter(row=>row.expectsPreview).length,metadataOnly:rows.filter(row=>!row.expectsPreview).length,
    unknown:unknown.length},unknown};
}
