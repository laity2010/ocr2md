/** Read-only element index over an effective DIRjson, including suppressed original OCR blocks. */
import type {DocumentIrV1,IrSourceElement} from './ir/documentIrV1';
import type {IrMarkdownChapterFile} from './ir/documentIrMarkdown';
export interface ElementView {
  readonly blockId:string;readonly type:string;readonly text:string;
  readonly chapterId:string|null;readonly readingOrder:number|null;
  readonly suppressed:boolean;readonly origin:'ocr'|'manual';
  readonly markdownRange:{from:number;to:number}|null;
  readonly pdfPages:readonly number[];
  readonly pdfRegions:readonly {elementId:string;page:number;bbox:readonly number[];
    normalizedBBox:readonly number[]}[];
  readonly media:readonly {elementId:string;type:'image'|'html'|'formula';value:string}[];
  readonly originalElementIds:readonly string[];
}
export function indexElements(doc:DocumentIrV1,markdown:IrMarkdownChapterFile,
  hidden:readonly string[]):ElementView[]{
  const sources=new Map(doc.sourceElements.map(e=>[e.id,e]));
  const byId=new Map(markdown.ranges.map(r=>[r.blockId,r]));
  const manual=new Map([...(doc.manualHeadings??[]),...(doc.manualTexts??[])].map(x=>[x.blockId,x]));
  return [...doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!).map(block=>{
    const items=block.sources.map(ref=>sources.get(ref.elementId)!).filter(Boolean);
    const regionIds=new Set<string>();const media:ElementView['media'][number][]=[];
    const regions=items.flatMap((source:IrSourceElement)=>{
      if(regionIds.has(source.id))return [];
      regionIds.add(source.id);
      return [{elementId:source.id,page:source.pdfPageNumber,bbox:source.bbox,
        normalizedBBox:source.normalizedBBox}];
    });
    const mediaIds=new Set<string>();
    for(const source of items)for(const s of source.segments){
      for(const [type,value] of [['image',s.imagePath],['html',s.html],
        ['formula',s.type==='interline_equation'||s.type==='inline_equation'?s.content:undefined]] as const){
        if(!value)continue;
        const key=source.id+'\0'+type+'\0'+value;
        if(mediaIds.has(key))continue;mediaIds.add(key);
        media.push({elementId:source.id,type,value});
      }
    }
    const range=byId.get(block.blockId),manualPage=manual.get(block.blockId)?.pdfPageNumber;
    return {blockId:block.blockId,type:block.type,text:block.text,chapterId:block.chapterId,
      readingOrder:block.readingOrder,suppressed:hidden.includes(block.blockId),
      origin:block.sources.length?'ocr' as const:'manual' as const,
      markdownRange:range?{from:range.contentFrom,to:range.contentTo}:null,
      pdfPages:[...new Set([...regions.map(r=>r.page),...(manualPage?[manualPage]:[])])].sort((a,b)=>a-b),
      pdfRegions:regions,media,originalElementIds:[...new Set(block.sources.map(r=>r.elementId))]};
  });
}
