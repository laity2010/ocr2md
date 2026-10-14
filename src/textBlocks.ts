import { createHash } from "crypto";
import type { Candidate } from "./types";

export type TextBlockType = "标题" | "内嵌" | "LaTeX块" | "文本" | "注释正文";

export function scanTextBlocks(markdown: string, sourcePath: string): Candidate[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const rows: Candidate[] = [];
  let blockStart = leadingFrontmatterEnd(lines);

  const pushBlock = (start: number, endExclusive: number) => {
    let first = start;
    let last = endExclusive - 1;
    while (first <= last && !lines[first]?.trim()) first += 1;
    while (last >= first && !lines[last]?.trim()) last -= 1;
    if (first > last) return;
    const raw = lines.slice(first, last + 1).join("\n");
    const lineType = classifyTextBlock(raw);
    const hash = createHash("sha256").update(`${first}\0${raw}`).digest("hex").slice(0, 16);
    rows.push({
      id: `text-block-${first}-${hash}`,
      rowId: `text-block-${first}-${hash}`,
      kind: "regex",
      label: raw.trim(),
      raw,
      preview: raw,
      range: {
        line: first,
        start: 0,
        endLine: last === first ? undefined : last,
        end: (lines[last] ?? "").length,
      },
      typeLabel: "文本块",
      lineType,
      sourcePath,
      sourceLabel: sourcePath.split(/[\\/]/).pop() ?? sourcePath,
      status: "候选",
    });
  };

  for (let index = blockStart; index < lines.length; index += 1) {
    if (/^\s*<br>\s*$/.test(lines[index] ?? "")) {
      pushBlock(blockStart, index);
      blockStart = index + 1;
    }
  }
  pushBlock(blockStart, lines.length);
  return rows;
}

export function classifyTextBlock(raw: string): TextBlockType {
  const firstLine = raw.split("\n").find((line) => line.trim())?.trim() ?? "";
  if (/^#{1,6}(?:\s+|$)/.test(firstLine)) return "标题";
  if (/^\[\^[^\]]+\]:/.test(firstLine)) return "注释正文";
  if (/^>/.test(firstLine) || /<embed\s+id\s*=/.test(raw)) return "内嵌";
  if (isStandaloneDisplayLatexBlock(raw)) return "LaTeX块";
  return "文本";
}

function isStandaloneDisplayLatexBlock(raw: string): boolean {
  const trimmed = raw.trim();
  const lines = trimmed.split("\n");
  if (lines.length < 2) return false;
  return lines[0]?.trim() === "$$"
    && lines[lines.length - 1]?.trim() === "$$";
}

function leadingFrontmatterEnd(lines: string[]): number {
  if (lines[0]?.replace(/^\uFEFF/, "").trim() !== "---") return 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (/^---[ \t]*$/.test(lines[index] ?? "")) return index + 1;
  }
  return 0;
}

/** V3 chapter-cleaning heading audit. Only *real* ATX headings in one chapter;
 * fenced Markdown and frontmatter do not generate chapter title candidates.
 * Ordinal prefixes are a UI concern, never inserted into Markdown content.
 */
export function scanChapterHeadingCandidates(markdown:string,sourcePath:string):Candidate[]{
  const lines=markdown.replace(/\r\n?/g,"\n").split("\n");
  const rows:Candidate[]=[];
  let frontmatter=false;
  let from=0;
  if(lines[0]?.replace(/^\uFEFF/,"").trim()==="---"){
    frontmatter=true;
    for(let index=1;index<lines.length;index++){
      if(/^---[ \t]*$/.test(lines[index]??"")){
        from=index+1;frontmatter=false;break;
      }
    }
  }
  if(frontmatter)return rows; // Unclosed frontmatter: no confident titles.
  let fence:"`"|"~"|undefined;
  let fenceWidth=0;
  for(let index=from;index<lines.length;index++){
    const line=lines[index]??"";
    const matchFence=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if(fence){
      if(matchFence&&matchFence[1][0]===fence&&matchFence[1].length>=fenceWidth&&
        /^[ \t]*$/.test(matchFence[2]??""))fence=undefined;
      continue;
    }
    if(matchFence){fence=matchFence[1][0] as "`"|"~";fenceWidth=matchFence[1].length;continue;}
    const heading=/^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(line);
    if(!heading)continue;
    const text=(heading[2]??"").replace(/[ \t]+#+[ \t]*$/,"").trim();
    const level=heading[1].length;
    const hash=createHash("sha256").update(`${index}\0${line}`).digest("hex").slice(0,16);
    rows.push({
      id:`chapter-heading-${index}-${hash}`,rowId:`chapter-heading-${index}-${hash}`,
      kind:"regex",label:text,raw:line,preview:line,
      range:{line:index,start:0,end:line.length},
      typeLabel:"章节标题",lineType:`${level} 级标题`,sourcePath,
      sourceLabel:sourcePath.split(/[\\/]/).pop()??sourcePath,status:"候选",
    });
  }
  return rows;
}
