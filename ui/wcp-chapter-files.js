/** Experiment-only projection: .cmd.chapter.md marks a bounded CMD chapter.
 * Reuse the mainline pure splitter and chapter membership calculation.
 */
import {chapterAssignments as coreAssignments,
  buildChapterFiles as coreBuild} from './chapter-files.js';
export {chapterStartFormat} from './chapter-files.js';
const named=name=>name.replace(/\.md$/,'.cmd.chapter.md');
export function chapterAssignments(rows,start=0){
  const chapters=coreAssignments(rows,start);
  for(const row of rows)row.chapterFile=named(row.chapterFile);
  return chapters.map(chapter=>({...chapter,file:named(chapter.file)}));
}
export function buildChapterFiles(markdown,rows,start=0){
  const files=coreBuild(markdown,rows,start);
  for(const row of rows)row.chapterFile=named(row.chapterFile);
  return files.map(file=>({...file,name:named(file.name)}));
}
