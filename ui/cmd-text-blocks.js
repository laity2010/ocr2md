/** CMD read-only MinerU block inventory. The sealed JSON inside THIS CMD
 * document is authoritative; never fetch a second, drifting original JSON.
 * This owner returns detached values and never mutates CM6 source. */
import {blockAnchor} from './mineru-anchors.js';
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
      // Chart/table parent bbox usually covers the body alone. Its child
      // caption and notes use separate original MinerU rectangles, but still
      // belong to ONE CMD Block (no extra anchors/checkboxes).
      const subRegions=['chart','table'].includes(block.type)?
        (block.blocks||[]).flatMap(child=>{
          if(![`${block.type}_caption`,`${block.type}_footnote`].includes(child.type))
            return [];
          const bbox=child.bbox;
          if(!Array.isArray(bbox)||bbox.length!==4||!bbox.every(Number.isFinite)||
            bbox[0]<0||bbox[1]<0||bbox[2]<=bbox[0]||bbox[3]<=bbox[1]||
            bbox[2]>pageSize[0]||bbox[3]>pageSize[1])return [];
          // MinerU may classify a paragraph beginning "Notes:" as
          // chart_caption rather than chart_footnote. Keep the OCR type
          // intact, expose the display role separately (no text cache).
          const opening=(child.lines?.[0]?.spans||[]).map(s=>s.content||'').join('').trim();
          const role=child.type.endsWith('_footnote')||/^Notes?\s*[:：]/i.test(opening)?
            'note':'caption';
          return [{type:child.type,role,bbox:[...bbox]}];
        }):[];
      return [{blockIndex,bbox:[...box],type:block.type||'unknown',subRegions}];
    });
    return {pageIndex,pageSize:[...pageSize],regions};
  });
  const layout={pages,source:'CMD-sealed-minerujson'};
  // Prevent accidental mutation of shared cache by layout or AG consumers.
  for(const page of pages){Object.freeze(page.pageSize);
    for(const region of page.regions){Object.freeze(region.bbox);
      for(const sub of region.subRegions){Object.freeze(sub.bbox);Object.freeze(sub);}
      Object.freeze(region.subRegions);
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
  return {pageIndex,blockIndex,pageSize:page.pageSize,bbox:block.bbox,type:block.type,lines};
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
