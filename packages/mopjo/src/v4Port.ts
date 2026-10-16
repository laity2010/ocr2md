/** WP05: WCP/V4-facing chapter data port. No filesystem, DOM, WCP, or V4 imports.
 * The host owns IO and MUST implement an atomic compare-and-swap for commitDelta.
 * This module never writes a PDF, OCR source, immutable chapter JSON, or MD.
 */
import {sha256} from './core';
import {applyChapterOp,chapterElements,chapterMarkdown,editChapterMarkdown,encodeChapter,
  encodeChapterDelta,openChapter,type ChapterDelta,type ChapterOriginal,type OpenChapter} from './chapters';
import {chapterSourceEvidence,chapterAnnotationAudit,chapterPdfPoint,
  chapterMarkdownOffset,effectiveChapterTree} from './chapterLocate';
import {chapterSegmentIndex} from './chapterSegments';

export const MOPJO_V4_PORT_VERSION=1 as const;
export interface V4ChapterPayload {
  /** Exact bytes of the immutable chapter baseline. */
  readonly original:Uint8Array;
  /** Exact bytes of the authoritative per-chapter incremental operation log. */
  readonly delta:Uint8Array;
  /** Original PDF bytes (may be supplied from a cache owned by the host). */
  readonly pdf:Uint8Array;
}
/** No direct MD writing. CAS must reject a stale expected delta atomically. */
export interface V4ChapterPort {
  listChapters():Promise<readonly string[]>;
  readChapter(filename:string):Promise<V4ChapterPayload>;
  commitDelta(filename:string,expected:Uint8Array,updated:Uint8Array):Promise<void>;
}
type Op=Parameters<typeof applyChapterOp>[1];
const parse=(bytes:Uint8Array)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const equal=(a:Uint8Array,b:Uint8Array)=>sha256(a)===sha256(b);
function filenameCheck(filename:string):void {
  if(typeof filename!=='string'||filename.length<4||filename.length>120||
    !filename.endsWith('.md')||filename.startsWith('.')||filename.includes('..')||
    /[\\/:*?"<>|\x00-\x1f]/u.test(filename))
    throw Error('MOPJO V4_CHAPTER_FILENAME_INVALID');
}
const headerLength=(doc:OpenChapter)=>chapterMarkdown(doc).length-doc.markdown.content.length;
const rangeShift=(value:{from:number;to:number}|null,shift:number)=>
  value?{from:value.from+shift,to:value.to+shift}:null;
const hitShift=<T extends {markdownRange:{from:number;to:number}|null}>(hit:T,shift:number):T=>
  ({...hit,markdownRange:rangeShift(hit.markdownRange,shift)});

/** Only chapters already handed to us by the authorized V4 storage service can be opened.
 * Each instance is a draft session; mutation is local until explicit save().
 */
export class MopjoV4ChapterSession {
  private working:OpenChapter;
  private committed:OpenChapter;
  private committedDelta:Uint8Array;
  private originalSha:string;
  private pdfSha:string;
  private saving=false;
  private constructor(private readonly port:V4ChapterPort,readonly filename:string,
    doc:OpenChapter,deltaRaw:Uint8Array,originalSha:string,pdfSha:string){
    this.working=doc;this.committed=doc;this.committedDelta=new Uint8Array(deltaRaw);
    this.originalSha=originalSha;this.pdfSha=pdfSha;
  }
  static async list(port:V4ChapterPort):Promise<readonly string[]>{
    const names=await port.listChapters();
    if(!Array.isArray(names)||new Set(names).size!==names.length)
      throw Error('MOPJO V4_CHAPTER_LIST_INVALID');
    for(const name of names)filenameCheck(name);
    return [...names];
  }
  static async open(port:V4ChapterPort,filename:string):Promise<MopjoV4ChapterSession>{
    filenameCheck(filename);
    const payload=await port.readChapter(filename);
    const original=parse(payload.original) as ChapterOriginal;
    const delta=parse(payload.delta) as ChapterDelta;
    if(original.filename!==filename||!equal(payload.original,encodeChapter(original)))
      throw Error('MOPJO V4_CHAPTER_BASELINE_MISMATCH');
    const doc=openChapter(original,delta,payload.pdf);
    return new MopjoV4ChapterSession(port,filename,doc,payload.delta,
      sha256(payload.original),sha256(payload.pdf));
  }
  get dirty():boolean{return !equal(encodeChapterDelta(this.working.delta),this.committedDelta);}
  summary(){
    return {version:MOPJO_V4_PORT_VERSION,filename:this.filename,
      chapterId:this.working.original.chapterId,
      operations:this.working.delta.operations.length,dirty:this.dirty,saving:this.saving,
      stateSha256:this.working.stateSha256,deltaRevision:sha256(this.committedDelta),
      sourceBookSha256:this.working.original.sourceBookIrSha256,
      pdfSha256:this.pdfSha,blocks:this.working.blocks.length,
      headerUtf16Length:headerLength(this.working)};
  }
  /** Full editable Markdown includes its version header; all public offsets are full MD UTF-16. */
  markdown():string{return chapterMarkdown(this.working);}
  elements(){
    const shift=headerLength(this.working);
    return chapterElements(this.working).map(e=>({...e,
      markdownRange:rangeShift(e.markdownRange,shift)}));
  }
  evidence(){return chapterSourceEvidence(this.working);}
  segments(){
    const shift=headerLength(this.working);
    return chapterSegmentIndex(this.working).map(s=>({...s,
      markdownRange:rangeShift(s.markdownRange,shift)}));
  }
  notes(){return chapterAnnotationAudit(this.working);}
  tree(){return effectiveChapterTree(this.working);}
  pdfPoint(page:number,x:number,y:number){
    const result=chapterPdfPoint(this.working,page,x,y),shift=headerLength(this.working);
    return {...result,matches:result.matches.map(hit=>hitShift(hit,shift))};
  }
  markdownOffset(fullDocumentOffset:number){
    if(!Number.isSafeInteger(fullDocumentOffset)||fullDocumentOffset<0||
      fullDocumentOffset>this.markdown().length)
      throw Error('MOPJO V4_INVALID_MARKDOWN_OFFSET');
    const shift=headerLength(this.working);
    if(fullDocumentOffset<shift)return {kind:'unmatched' as const};
    const result=chapterMarkdownOffset(this.working,fullDocumentOffset-shift);
    return result.hit?{kind:result.kind,hit:hitShift(result.hit,shift)}:result;
  }
  private ensureNotSaving(){
    if(this.saving)throw Error('MOPJO V4_SAVE_IN_PROGRESS');
  }
  operate(operation:Op){
    this.ensureNotSaving();
    this.working=applyChapterOp(this.working,operation);return this.summary();
  }
  editMarkdown(fullMarkdown:string){
    this.ensureNotSaving();
    this.working=editChapterMarkdown(this.working,fullMarkdown);return this.summary();
  }
  discardDraft(){
    this.ensureNotSaving();
    this.working=this.committed;return this.summary();
  }
  /** Only the delta is committed. Host CAS and readback are mandatory, no MD cache write. */
  async save(){
    this.ensureNotSaving();
    if(!this.dirty)return this.summary();
    this.saving=true;
    try{
    const nextDelta=encodeChapterDelta(this.working.delta),previous=this.committedDelta;
    await this.port.commitDelta(this.filename,new Uint8Array(previous),new Uint8Array(nextDelta));
    const reread=await this.port.readChapter(this.filename);
    if(sha256(reread.original)!==this.originalSha||sha256(reread.pdf)!==this.pdfSha||
      !equal(reread.delta,nextDelta))throw Error('MOPJO V4_SAVE_READBACK_MISMATCH');
    const verified=openChapter(parse(reread.original),parse(reread.delta),reread.pdf);
    if(chapterMarkdown(verified)!==this.markdown())
      throw Error('MOPJO V4_SAVE_REPLAY_MISMATCH');
    this.committed=verified;this.working=verified;
    this.committedDelta=new Uint8Array(reread.delta);
    }finally{this.saving=false;}
    return this.summary();
  }
}
