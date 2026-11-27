import {sha256,canonicalRows} from '../ui/translation/original-sentences.js';
export async function sampleSnapshot(suffix='',includeFormula=false,reading=false){
 const lines=[['# Heading\n\n','title',''],['> A. B. 😀'+suffix+'\n','text','>'],['<table><tr><td>Text</td></tr></table>\n','table_body','']];
 if(reading){lines[1][0]='> A. B. 😀'+suffix+' with $r_t$ and `code`.\n';lines[2][0]='<table><tr><td>Text</td><td><eq>x</eq></td></tr></table>\n';}
 if(includeFormula)lines.push(['$$x=1$$\n','interline_equation','']);
 const hash=await sha256(lines.map(x=>x[0]).join(''));
 const rows=[];let number=1;
 for(const [raw,type,level] of lines){
  const body=raw.split('\n')[0],source_line_hash=await sha256(body+'\n'),parts=type==='text'?['> A.',raw.slice(4)]:[raw];let from=0;
  for(const [sentence_index,part] of parts.entries()){
   const to=from+part.split('\n')[0].length;
   rows.push({source_document_hash:hash,source_line:number,source_line_hash,sentence_index,from_utf16:from,to_utf16:to,raw:part,type,level,candidates_json:sentence_index===0?'{}':null,review_state:sentence_index===0?(parts.length>1?'agreed':'no_split'):null,adopted_engine:null});from=to;
  }
  number+=raw.split('\n').length-1;
 }
 return {schema:'ocr2md-sentence-snapshot/v1',source_document_hash:hash,sentence_sha256:await sha256(canonicalRows(rows)),rows};
}
