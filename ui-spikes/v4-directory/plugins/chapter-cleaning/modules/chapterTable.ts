/** HTML table audit is an independent cleaning module; scanning stays pure. */
import {scanChapterElements} from "../../../../../src/chapterElementCatalog";
import type {ChapterModuleDefinition} from "./contracts";
export const chapterTableModule:ChapterModuleDefinition={
  id:"表格",stage:"cleaning",toolIds:[],
  scan:(markdown,path)=>scanChapterElements(markdown,path,"表格"),
};
