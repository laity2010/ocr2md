/** WP3: read-only evidence chain MinerU original MD -> canonical chapter MD -> working MD.
 * No I/O, no writes, no automatic verified status. */
import { createHash } from "crypto";
import type { MineruElementIndex, MineruBBox } from "./mineruElementExtractor";
import {
  compareMineruIndexWithOriginalMd, type MineruMdResultState,
  type MineruMdPartKind, type MineruUtf16Range,
} from "./mineruMarkdownReconstruction";

export interface MappingDocument {
  /** Logical Vault-root path, never an absolute OS path. */
  readonly path: string;
  readonly text: string;
  /** SHA-256 of original UTF-8 bytes, supplied by caller. */
  readonly sha256: string;
}
export interface CanonicalChapter {
  readonly chapterId: string;
  readonly source: MappingDocument;
  readonly working: MappingDocument;
}
export type ChapterLinkStatus =
  "candidate-complete" | "candidate-partial" | "ambiguous" | "unmatched" | "unavailable";
export type ChapterEvidenceState = "unique" | "ambiguous" | "partial-evidence" | "not-found";
export interface ChapterDocumentAnchor {
  readonly chapterId: string;
  readonly path: string;
  readonly sha256: string;
  readonly state: ChapterEvidenceState;
  /** Actual UTF-16 half-open positions, relative to this file (including frontmatter). */
  readonly rangesUtf16: readonly MineruUtf16Range[];
  readonly fragmentEvidenceUtf16: readonly MineruUtf16Range[];
  readonly matchedTextSha256?: string;
  readonly previousContextSha256?: string;
  readonly nextContextSha256?: string;
}
export interface ChapterPartLink {
  readonly partIndex: number;
  readonly partKind: MineruMdPartKind;
  readonly originalState: MineruMdResultState;
  readonly originalMdRangesUtf16: readonly MineruUtf16Range[];
  readonly originalMdFragmentEvidenceUtf16: readonly MineruUtf16Range[];
  readonly chapterAnchors: readonly ChapterDocumentAnchor[];
  readonly workingAnchors: readonly ChapterDocumentAnchor[];
}
export interface ChapterElementLink {
  readonly elementId: string;
  readonly pdfPageNumber: number;
  readonly pageIndex: number;
  readonly bbox: MineruBBox;
  readonly type: string;
  readonly originalMdState: MineruMdResultState;
  readonly status: ChapterLinkStatus;
  readonly chapters: readonly string[];
  readonly parts: readonly ChapterPartLink[];
  readonly manuallyVerified: false;
}
export interface ChapterMappingResult {
  readonly schemaVersion: 1;
  readonly sourceJsonSha256: string;
  readonly originalMd: {readonly path:string;readonly sha256:string};
  readonly chapterVersions: readonly {
    readonly chapterId:string;
    readonly source:{readonly path:string;readonly sha256:string};
    readonly working:{readonly path:string;readonly sha256:string};
  }[];
  readonly elements:readonly ChapterElementLink[];
  readonly ignoredDiscardedCount:number;
}

function sha(value:string):string{return createHash("sha256").update(value,"utf8").digest("hex");}
function escapeRegex(value:string):string{
  return value.replace(/[.*+?^$()|[\]{}\\]/g,"\\$&");
}
function contentStart(text:string):number{
  const front=/^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u.exec(text);
  return front?front[0].length:0;
}
function locate(text:string,term:string,from:number,relaxWhitespace:boolean):MineruUtf16Range[]{
  const found:MineruUtf16Range[]=[];
  if(!term.trim())return found;
  if(!relaxWhitespace){
    let pos=from;
    while(pos<text.length){
      const idx=text.indexOf(term,pos);
      if(idx<0)break;
      found.push([idx,idx+term.length]);
      if(found.length>=5)break;
      pos=idx+Math.max(1,term.length);
    }
  }else{
    const re=new RegExp(escapeRegex(term.trim()).replace(/\s+/gu,"\\s+"),"gu");
    re.lastIndex=from;
    for(const m of text.matchAll(re)){
      if(m.index<from)continue;
      found.push([m.index,m.index+m[0].length]);
      if(found.length>=5)break;
    }
  }
  return found;
}
function equivalentImageRanges(text:string,markdown:string,from:number):MineruUtf16Range[]{
  const original=/^!\[[^\]]*\]\(([^)]+)\)$/u.exec(markdown.trim());
  if(!original)return [];
  const basename=original[1].split(/[?#]/u)[0].split("/").at(-1)??"";
  // Permit only sufficiently long, content-derived image filenames; never
  // match generic image.jpg, common logos or a mere alt-text label.
  if(!/^[0-9a-f]{40,}\.(?:jpg|jpeg|png|webp)$/iu.test(basename))return [];
  const found:MineruUtf16Range[]=[];
  const re=/!\[[^\]]*\]\(([^)]+)\)/gu;
  re.lastIndex=from;
  for(const m of text.matchAll(re)){
    if(m.index<from)continue;
    const leaf=m[1].split(/[?#]/u)[0].split("/").at(-1)??"";
    if(leaf===basename){
      found.push([m.index,m.index+m[0].length]);
      if(found.length>=5)break;
    }
  }
  return found;
}
function evidence(text:string,term:string):{state:ChapterEvidenceState;
  rangesUtf16:MineruUtf16Range[];fragmentEvidenceUtf16:MineruUtf16Range[]}{
  const none={state:"not-found" as const,rangesUtf16:[],fragmentEvidenceUtf16:[]};
  if(term.trim().length<8)return none;
  const from=contentStart(text);
  let matches=locate(text,term,from,false);
  if(!matches.length)matches=locate(text,term,from,true);
  if(!matches.length)matches=equivalentImageRanges(text,term,from);
  if(matches.length===1)return {state:"unique",rangesUtf16:matches,fragmentEvidenceUtf16:[]};
  if(matches.length>1)return {state:"ambiguous",rangesUtf16:matches,fragmentEvidenceUtf16:[]};
  if(term.length<85)return none;
  const first=locate(text,term.slice(0,65),from,true);
  const last=locate(text,term.slice(-65),from,true);
  if(first.length===1&&last.length===1&&first[0][0]<last[0][0]&&
     last[0][1]-first[0][0]<Math.max(1200,Math.min(12000,term.length*3)))
    return {state:"partial-evidence",rangesUtf16:[],fragmentEvidenceUtf16:[first[0],last[0]]};
  return none;
}
function makeAnchor(chapterId:string,doc:MappingDocument,search:string):ChapterDocumentAnchor{
  const found=evidence(doc.text,search);
  const range=found.state==="unique"?found.rangesUtf16[0]:undefined;
  return {chapterId,path:doc.path,sha256:doc.sha256,...found,
    ...(range?{
      matchedTextSha256:sha(doc.text.slice(...range)),
      previousContextSha256:sha(doc.text.slice(Math.max(0,range[0]-80),range[0])),
      nextContextSha256:sha(doc.text.slice(range[1],range[1]+80)),
    }:{})};
}
function validateDoc(doc:MappingDocument):void{
  if(!doc.path.startsWith("/")||doc.path.split("/").includes("..")||
    doc.path.includes("\\")||!/^[0-9a-f]{64}$/u.test(doc.sha256))
    throw Error("Invalid logical document path or SHA256");
  if(sha(doc.text)!==doc.sha256)throw Error(`Stale document text/hash: ${doc.path}`);
}
function validatePairs(pairs:readonly CanonicalChapter[]):void{
  const ids=new Set<string>(),paths=new Set<string>();
  for(const pair of pairs){
    if(!pair.chapterId||ids.has(pair.chapterId))throw Error("Duplicate or empty chapter ID");
    ids.add(pair.chapterId);
    validateDoc(pair.source);validateDoc(pair.working);
    if(!pair.source.path.endsWith(".md")||pair.source.path.endsWith(".working.md")||
      pair.working.path!==pair.source.path.replace(/\.md$/u,".working.md"))
      throw Error(`Not a canonical chapter pair: ${pair.chapterId}`);
    for(const doc of [pair.source,pair.working]){
      if(paths.has(doc.path))throw Error(`Repeated document path: ${doc.path}`);
      paths.add(doc.path);
    }
  }
}
/** Link only candidate evidence. Changes in chapter/working MD are independent.
 * User approval/sidecar storage is deliberately deferred to WP4 and WP8. */
export function mapMineruToChapterDrafts(index:MineruElementIndex,originalMd:MappingDocument,
  pairs:readonly CanonicalChapter[]):ChapterMappingResult{
  validateDoc(originalMd);validatePairs(pairs);
  const byId=new Map(index.bodyElements.map(e=>[e.id,e]));
  const comparisons=compareMineruIndexWithOriginalMd(index,originalMd.text);
  const elements:ChapterElementLink[]=comparisons.map(comp=>{
    const parts:ChapterPartLink[]=comp.matches.map((match,partIndex)=>{
      const completeOriginal=match.state==="unique"&&match.rangesUtf16.length===1;
      const needle=completeOriginal?
        originalMd.text.slice(...match.rangesUtf16[0]):match.part.lookup;
      const chapterAnchors:ChapterDocumentAnchor[]=[];
      const workingAnchors:ChapterDocumentAnchor[]=[];
      for(const pair of pairs){
        const ch=makeAnchor(pair.chapterId,pair.source,needle);
        if(ch.state!=="not-found")chapterAnchors.push(ch);
        const working=makeAnchor(pair.chapterId,pair.working,needle);
        if(working.state!=="not-found")workingAnchors.push(working);
      }
      return {partIndex,partKind:match.part.kind,originalState:match.state,
        originalMdRangesUtf16:match.rangesUtf16,
        originalMdFragmentEvidenceUtf16:match.fragmentEvidenceUtf16,
        chapterAnchors,workingAnchors};
    });
    const anchors=parts.flatMap(p=>[...p.chapterAnchors,...p.workingAnchors]);
    const chapters=[...new Set(anchors.map(x=>x.chapterId))].sort();
    const sourceStrong=comp.state==="unique"&&parts.every(p=>p.originalState==="unique");
    const hasConflict=parts.some(p=>p.originalState==="ambiguous"||
      [...p.chapterAnchors,...p.workingAnchors].some(a=>a.state==="ambiguous"));
    const complete=sourceStrong&&parts.length>0&&chapters.length===1&&
      parts.every(p=>p.chapterAnchors.length===1&&p.workingAnchors.length===1&&
        p.chapterAnchors[0].state==="unique"&&p.workingAnchors[0].state==="unique"&&
        p.chapterAnchors[0].chapterId===p.workingAnchors[0].chapterId);
    let status:ChapterLinkStatus="unmatched";
    if(comp.state==="unavailable")status="unavailable";
    else if(hasConflict||chapters.length>1)status="ambiguous";
    else if(complete)status="candidate-complete";
    else if(anchors.length)status="candidate-partial";
    const source=byId.get(comp.candidate.elementId);
    if(!source)throw Error("Missing originating PDF block");
    return {elementId:source.id,pdfPageNumber:source.pdfPageNumber,pageIndex:source.pageIndex,
      bbox:source.bbox,type:source.type,originalMdState:comp.state,
      status,chapters,parts,manuallyVerified:false};
  });
  return {schemaVersion:1,sourceJsonSha256:index.sourceSha256,
    originalMd:{path:originalMd.path,sha256:originalMd.sha256},
    chapterVersions:pairs.map(p=>({chapterId:p.chapterId,
      source:{path:p.source.path,sha256:p.source.sha256},
      working:{path:p.working.path,sha256:p.working.sha256}})),
    elements,ignoredDiscardedCount:index.discardedElements.length};
}
