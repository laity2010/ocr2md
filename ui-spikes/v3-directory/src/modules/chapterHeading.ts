/** Published chapter heading audit; no changes to Markdown when numbering. */
import {scanChapterHeadingCandidates} from "../../../../src/textBlocks";
import type {ChapterModuleDefinition} from "./contracts";
export const chapterHeadingModule:ChapterModuleDefinition={
  id:"章节标题",stage:"cleaning",toolIds:["wb-clean-heading-numbers-label"],
  scan:scanChapterHeadingCandidates,
};
export function applyChapterHeadingNumbering(
  enabled:boolean,apply:(enabled:boolean)=>void,report:(message:string)=>void):void{
  apply(enabled);
  report(`章节标题 · 标题序号${enabled?"已显示":"已隐藏"}（仅影响表格，不修改 MD）`);
}
