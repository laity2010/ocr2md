/** WP2: read-only Markdown evidence from original MinerU element spans.
 * Every proposal is a candidate, never an edited MD or a verified PDF↔MD link.
 */
import type { MineruSourceElement, MineruElementIndex, MineruRawBlock, MineruRawLine } from "./mineruElementExtractor";

export type MineruMdPartKind = "heading" | "paragraph" | "reference" | "formula" |
  "image" | "table-html" | "caption" | "footnote";
export type MineruMdResultState = "unique" | "ambiguous" | "partial-evidence" | "not-found" | "unavailable";
export type MineruUtf16Range = readonly [number, number];
export interface MineruMdPart {
  readonly kind: MineruMdPartKind;
  readonly sourceJsonPointer: string;
  readonly markdown: string;
  /** Evidence string used in the original MD (may omit heading / math wrappers). */
  readonly lookup: string;
}
export interface MineruMdCandidate {
  readonly elementId: string;
  readonly pageIndex: number;
  readonly type: string;
  readonly proposal: string | null;
  readonly parts: readonly MineruMdPart[];
  readonly reconstruction: "ready" | "partial" | "unavailable";
  readonly warnings: readonly string[];
}
export interface MineruMdPartComparison {
  readonly part: MineruMdPart;
  readonly state: MineruMdResultState;
  /** Offsets are UTF-16 JS string indices into the *original* MinerU MD. */
  readonly rangesUtf16: readonly MineruUtf16Range[];
  /** Long text may yield partial fragment evidence, never a confirmed anchor. */
  readonly fragmentEvidenceUtf16: readonly MineruUtf16Range[];
}
export interface MineruMdComparison {
  readonly candidate: MineruMdCandidate;
  /** Only a fully unique, complete candidate qualifies as unique. */
  readonly state: MineruMdResultState;
  readonly matches: readonly MineruMdPartComparison[];
  /** A unique MD range per constituent part; does NOT imply a verified cross-document match. */
  readonly rangesUtf16: readonly MineruUtf16Range[];
}

function spansText(lines: readonly MineruRawLine[] | undefined): string {
  return (lines ?? []).map(line=>(line.spans??[]).map(s=>s.content??"").join("")).filter(Boolean).join(" ").trim();
}
function addPart(target: MineruMdPart[], kind: MineruMdPartKind,
  at: string, value: string, markdown: string): void {
  if(value.trim())target.push({kind,sourceJsonPointer:at,markdown,lookup:value.trim()});
}
function escapeMdUrl(url: string): string {
  // Preserve MinerU's original URL, no network lookup or image download.
  return url;
}
/** Treat parent order as recorded; never mix caption/body/footnote semantics. */
function collectSubparts(target: MineruMdPart[], raw: MineruRawBlock,
  pointer: string, warnings: string[]): void {
  const subs=raw.blocks??[];
  if (!subs.length) warnings.push("no-nested-blocks");
  subs.forEach((sub,i)=>{
    const at=`${pointer}/blocks/${i}`;
    const kind=sub.type;
    const text=spansText(sub.lines);
    if(kind.endsWith("_caption"))addPart(target,"caption",at,text,text);
    else if(kind.endsWith("_footnote"))addPart(target,"footnote",at,text,text);
    let foundBody=false;
    (sub.lines??[]).forEach((line,l)=>{
      (line.spans??[]).forEach((span,s)=>{
        const location=`${at}/lines/${l}/spans/${s}`;
        if(span.html){addPart(target,"table-html",location,span.html,span.html);foundBody=true;}
        if(span.image_path){const url=escapeMdUrl(span.image_path);
          addPart(target,"image",location,url,`![image](${url})`);foundBody=true;}
        if(span.content && (kind.endsWith("_body") || (!kind.endsWith("_caption") && !kind.endsWith("_footnote")))){
          addPart(target,"paragraph",location,span.content,span.content);foundBody=true;
        }
      });
    });
    if(kind.endsWith("_body") && !foundBody)warnings.push(`${kind}-without-content:${at}`);
  });
}
export function reconstructMineruMarkdown(element: MineruSourceElement): MineruMdCandidate {
  const parts: MineruMdPart[]=[];
  const warnings: string[]=[];
  const raw=element.rawBlock;
  const at=element.jsonPointer;
  const plain=spansText(raw.lines);
  switch(element.type){
    case "title": {
      const level=typeof raw.level==="number" && Number.isInteger(raw.level) &&
        raw.level>=1 && raw.level<=6 ? raw.level : undefined;
      if(level===undefined)warnings.push("title-level-missing-or-invalid");
      addPart(parts,"heading",at,plain,`${"#".repeat(level??2)} ${plain}`);
      break;
    }
    case "text":
      addPart(parts,"paragraph",at,plain,plain);
      if(raw.merge_prev===true)warnings.push("merge_prev=true:prior-paragraph-may-continue");
      break;
    case "ref_text":addPart(parts,"reference",at,plain,plain);break;
    case "interline_equation":
      if(plain)addPart(parts,"formula",at,plain,`$$\n${plain}\n$$`);
      else warnings.push("formula-without-content");
      break;
    case "table":
    case "chart":
    case "image":
      collectSubparts(parts,raw,at,warnings);
      break;
    default:
      warnings.push(`unsupported-type:${element.type}`);
      // Raw OCR evidence remains available from WP1, but no guessed Markdown text.
      break;
  }
  if(!parts.length)warnings.push("no-reconstructable-md-parts");
  const reconstruction: MineruMdCandidate["reconstruction"]=!parts.length?"unavailable":
    warnings.some(w=>w.includes("without-content")||w.startsWith("unsupported-"))?"partial":"ready";
  return {elementId:element.id,pageIndex:element.pageIndex,type:element.type,
    proposal:parts.length?parts.map(p=>p.markdown).join("\n\n"):null,
    parts,reconstruction,warnings};
}
function escapeRegex(text: string):string{return text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function literalRange(haystack:string, needle:string, flexibleWhitespace:boolean):MineruUtf16Range[] {
  // Search the original text; regex indices and lengths are JS UTF-16 offsets.
  const normalized=needle.normalize("NFC").trim();
  if(!normalized)return [];
  let source=escapeRegex(normalized);
  if(flexibleWhitespace)source=source.replace(/\s+/gu,"\\s+");
  const expression=new RegExp(source,"gu");
  const found:MineruUtf16Range[]=[];
  for(const match of haystack.matchAll(expression)){
    found.push([match.index,match.index+match[0].length]);
    if(found.length>=5)break; // 5 means ambiguous; no need to scan all duplicates.
  }
  return found;
}
function matchPart(md:string,part:MineruMdPart): MineruMdPartComparison {
  const literal=part.lookup;
  let ranges:MineruUtf16Range[]=[];
  if(part.kind==="image"){
    // Only match a Markdown image URL rather than an unrelated plain-text URL.
    const escaped=escapeRegex(literal);
    const reg=new RegExp(`!\\[[^\\]]*\\]\\(${escaped}\\)`,"gu");
    for(const match of md.matchAll(reg)){
      ranges.push([match.index,match.index+match[0].length]);
      if(ranges.length>=5)break;
    }
  } else {
    ranges=literalRange(md,literal,false);
    if(!ranges.length)ranges=literalRange(md,literal,true);
  }
  let state:MineruMdResultState=ranges.length===1?"unique":ranges.length>1?"ambiguous":"not-found";
  let fragments:MineruUtf16Range[]=[];
  // Text may have been merged or rendered with inline formatting. A partial
  // fragment hit is *evidence only*, never a trusted full paragraph location.
  if(state==="not-found" && (part.kind==="paragraph"||part.kind==="reference")
    && literal.length>=70){
    const lines=literal.match(/.{20,90}/gu)??[];
    for(const fragment of [lines[0],lines.at(-1)]){
      if(!fragment || fragment.length<20)continue;
      const matches=literalRange(md,fragment,true);
      if(matches.length===1 && !fragments.some(f=>f[0]===matches[0][0]))fragments.push(matches[0]);
    }
    if(fragments.length===2 && fragments[0][0]<fragments[1][0]
       && fragments[1][1]-fragments[0][0]<12000)state="partial-evidence";
    else fragments=[];
  }
  return {part,state,rangesUtf16:ranges,fragmentEvidenceUtf16:fragments};
}
export function compareMineruCandidateWithOriginalMd(candidate:MineruMdCandidate,
  originalMd:string):MineruMdComparison {
  const matches=candidate.parts.map(p=>matchPart(originalMd,p));
  let state:MineruMdResultState="unavailable";
  if(matches.length){
    if(matches.some(m=>m.state==="ambiguous"))state="ambiguous";
    else if(matches.every(m=>m.state==="unique") && candidate.reconstruction==="ready")state="unique";
    else if(matches.some(m=>m.state==="unique"||m.state==="partial-evidence"))state="partial-evidence";
    else state="not-found";
  }
  const ranges=matches.filter(m=>m.state==="unique").flatMap(m=>m.rangesUtf16);
  // If parts have different monotone document order, preserve the evidence but
  // don't call the composite source a unique candidate.
  if(state==="unique" && ranges.some((r,i)=>i>0 && r[0]<ranges[i-1][0]))state="ambiguous";
  return {candidate,state,matches,rangesUtf16:ranges};
}
export function compareMineruIndexWithOriginalMd(index:MineruElementIndex,originalMd:string):
  readonly MineruMdComparison[] {
  return index.bodyElements.map(element=>compareMineruCandidateWithOriginalMd(
    reconstructMineruMarkdown(element),originalMd));
}
