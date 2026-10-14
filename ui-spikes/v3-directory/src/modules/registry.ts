/** Explicit deterministic module registration. No dynamic import or UI side effects. */
import type {ChapterModuleDefinition,CleaningModuleId} from "./contracts";
import {chapterBoundaryModule} from "./chapterBoundary";
import {chapterHeadingModule} from "./chapterHeading";
import {chapterMediaModule} from "./chapterMedia";
import {chapterTableModule} from "./chapterTable";
import {chapterLatexModule} from "./chapterLatex";

export const chapterModules=[
  chapterBoundaryModule,chapterHeadingModule,chapterMediaModule,
  chapterTableModule,chapterLatexModule,
] as const satisfies readonly ChapterModuleDefinition[];
export function cleaningModule(id:CleaningModuleId):ChapterModuleDefinition&{
  scan:(md:string,path:string)=>import("../../../../src/types").Candidate[];
}{
  const entry=chapterModules.find(item=>item.id===id);
  if(!entry||entry.stage!=="cleaning"||!entry.scan)
    throw Error("未知章节清洗模块："+id);
  return entry as ChapterModuleDefinition&{scan:(md:string,path:string)=>import("../../../../src/types").Candidate[]};
}
export function toolIdsForCleaning(id:CleaningModuleId):readonly string[]{
  return cleaningModule(id).toolIds;
}
