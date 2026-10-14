/** Exact, structural OCR provenance for a published chapter heading.
 * A heading is only anchored when its directly preceding line is a unique
 * immutable DIRjson block marker. Never fuzzy-match OCR titles or guess pages.
 */
export function chapterHeadingBlockId(markdown:string,headingLine:number):string|undefined{
  const lines=markdown.replace(/\r\n?/g,"\n").split("\n");
  if(!Number.isSafeInteger(headingLine)||headingLine<=0||headingLine>=lines.length)return;
  const match=/^<!-- ocr2md-ir:block=([A-Za-z0-9:_-]{8,128}) -->$/.exec(lines[headingLine-1]??"");
  if(!match)return;
  const marker=`<!-- ocr2md-ir:block=${match[1]} -->`;
  if(lines.filter(line=>line===marker).length!==1)return;
  return match[1];
}
