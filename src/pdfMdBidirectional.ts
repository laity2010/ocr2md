/** WP6 read-only PDF ↔ MD navigation index. Only unique, full evidence is
 * navigable. Never infer a position from filename, row number, or fuzzy text. */
import type { PdfMdMappingSidecarV1, MappingRelationV1 } from "./mineruMappingSidecar";
import { normalizeLogicalPath } from "./workspaceFsV3";

export interface PdfMdTextTarget {
  readonly elementId:string;
  readonly path:string;
  readonly sha256:string;
  readonly from:number;
  readonly to:number;
  readonly layer:"working"|"chapter"|"original";
}
export type PdfMdResult<T> = {kind:"unique"; value:T} |
  {kind:"ambiguous";count:number} | {kind:"unmatched"};

export function sidecarMdDocuments(map:PdfMdMappingSidecarV1):readonly {path:string;sha256:string}[]{
  const docs=[map.originalMd,...map.chapterVersions.flatMap(c=>[c.source,c.working])];
  const seen=new Map<string,string>();
  for(const doc of docs){
    if(normalizeLogicalPath(doc.path)!==doc.path||!doc.path.endsWith(".md")||
      !/^[a-f0-9]{64}$/u.test(doc.sha256))throw Error("Invalid mapped Markdown source");
    if(seen.has(doc.path)&&seen.get(doc.path)!==doc.sha256)throw Error("Conflicting Markdown hashes");
    seen.set(doc.path,doc.sha256);
  }
  return [...seen].map(([path,sha256])=>({path,sha256}));
}
export function pdfElementMdTargets(map:PdfMdMappingSidecarV1,elementId:string):PdfMdTextTarget[]{
  const relation=map.relations.find(r=>r.elementId===elementId);
  if(!relation)return [];
  const expected=new Map(sidecarMdDocuments(map).map(d=>[d.path,d.sha256]));
  const targets:PdfMdTextTarget[]=[];
  const push=(path:string,hash:string,layer:PdfMdTextTarget["layer"],range:readonly number[])=>{
    if(expected.get(path)!==hash||range.length!==2||!Number.isSafeInteger(range[0])||
      !Number.isSafeInteger(range[1])||range[0]<0||range[1]<=range[0])return;
    targets.push({elementId,path,sha256:hash,from:range[0],to:range[1],layer});
  };
  for(const part of relation.parts){
    if(part.originalState==="unique"&&part.originalMdRangesUtf16.length===1)
      push(map.originalMd.path,map.originalMd.sha256,"original",part.originalMdRangesUtf16[0]);
    for(const [key,layer] of [["chapterAnchors","chapter"],["workingAnchors","working"]] as const){
      for(const anchor of part[key]){
        if(anchor.state!=="unique"||anchor.rangesUtf16.length!==1)continue;
        push(anchor.path,anchor.sha256,layer,anchor.rangesUtf16[0]);
      }
    }
  }
  const found=new Map<string,PdfMdTextTarget>();
  for(const t of targets)found.set(`${t.layer}\0${t.path}\0${t.from}\0${t.to}`,t);
  return [...found.values()].sort((a,b)=>
    ["working","chapter","original"].indexOf(a.layer)-["working","chapter","original"].indexOf(b.layer)||
    a.path.localeCompare(b.path)||a.from-b.from);
}
/** Only a single verified original/working/chapter element can navigate automatically. */
export function mdElementAtOffset(map:PdfMdMappingSidecarV1,path:string,offset:number):PdfMdResult<MappingRelationV1>{
  if(!Number.isSafeInteger(offset)||offset<0)return {kind:"unmatched"};
  const hits=map.relations.filter(r=>pdfElementMdTargets(map,r.elementId).some(t=>
    t.path===path&&offset>=t.from&&offset<t.to));
  if(!hits.length)return {kind:"unmatched"};
  if(hits.length>1)return {kind:"ambiguous",count:hits.length};
  return {kind:"unique",value:hits[0]};
}
/** AG row selections may span many OCR elements. Refuse to guess one. */
export function mdElementsOverlappingRange(map:PdfMdMappingSidecarV1,path:string,
  from:number,to:number):PdfMdResult<MappingRelationV1>{
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<=from)
    return {kind:"unmatched"};
  const hits=map.relations.filter(r=>pdfElementMdTargets(map,r.elementId).some(t=>
    t.path===path&&t.from<to&&t.to>from));
  if(!hits.length)return {kind:"unmatched"};
  if(hits.length>1)return {kind:"ambiguous",count:hits.length};
  return {kind:"unique",value:hits[0]};
}
export function pdfElementAtPoint(map:PdfMdMappingSidecarV1,page:number,x:number,y:number):PdfMdResult<MappingRelationV1>{
  if(!Number.isSafeInteger(page)||page<1||!Number.isFinite(x)||!Number.isFinite(y)||
    x<0||x>1||y<0||y>1)return {kind:"unmatched"};
  const hits=map.relations.filter(r=>r.pdfRegions.some(p=>p.pdfPageNumber===page&&
    x>=p.normalizedBBox[0]&&x<=p.normalizedBBox[2]&&
    y>=p.normalizedBBox[1]&&y<=p.normalizedBBox[3]));
  if(!hits.length)return {kind:"unmatched"};
  if(hits.length>1)return {kind:"ambiguous",count:hits.length};
  return {kind:"unique",value:hits[0]};
}
