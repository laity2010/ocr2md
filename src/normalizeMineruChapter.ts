/** Non-destructive, deterministic MinerU -> native Obsidian Markdown cleanup.
 * Works on EXISTING published chapter text, not old DIRjson. It preserves all
 * user edits; the caller creates an undo snapshot and explicitly saves via CAS.
 */
import {safeObsidianHtmlTable} from './obsidianTableSanitize';
export interface ChapterNormalization {text:string; math:number;tables:number;unresolvedTables:number; pendingEquations:number;changed:boolean;}
export function normalizeMineruChapter(source:string):ChapterNormalization {
  const lines=source.split('\n');const rewritten=[...lines];
  let math=0,tables=0,unresolvedTables=0,pendingEquations=0;
  for(let index=0;index<lines.length;index++){
    const opening=/^ {0,3}(`{3,}|~{3,})(math|latex|tex|html)[ \t]*$/i.exec(lines[index]);
    if(!opening)continue;
    const fence=opening[1];
    const closing=new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`);
    let end=index+1;
    while(end<lines.length&&!closing.test(lines[end]))end++;
    if(end>=lines.length)continue;
    const body=lines.slice(index+1,end).join('\n');
    let replacement:string|null=null;
    if(opening[2].toLowerCase()==='html'){
      const canonical=safeObsidianHtmlTable(body);
      if(canonical){
        tables++;
        pendingEquations+=(canonical.match(/ocr2md-latex-pending/g)??[]).length;
        replacement=canonical;
      }else if(/^\s*<table\b/i.test(body))unresolvedTables++;
    }else if(body.trim()){
      // The information fence only changes delimiter syntax. The TeX body
      // stays byte-for-byte within its original physical source lines.
      rewritten[index]='$$';
      rewritten[end]='$$';
      math++;
    }
    if(replacement!==null){
      // Preserve the original physical line count, even for multiline tables,
      // so AG, PDF evidence and the CodeMirror gutter stay aligned.
      rewritten[index]='';
      rewritten[index+1]=replacement;
      for(let at=index+2;at<=end;at++)rewritten[at]='';
    }
    index=end;
  }
  const text=rewritten.join('\n');
  return {text,math,tables,unresolvedTables,pendingEquations,changed:text!==source};
}
