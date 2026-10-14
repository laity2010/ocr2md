/** In-line, display and table-embedded LaTeX review; editing is shared. */
import {scanChapterElements} from "../../../../../src/chapterElementCatalog";
import type {ChapterModuleDefinition} from "./contracts";
export const chapterLatexModule:ChapterModuleDefinition={
  id:"LaTeX",stage:"cleaning",toolIds:[],
  scan:(markdown,path)=>scanChapterElements(markdown,path,"LaTeX"),
};
